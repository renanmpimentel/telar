"use client";

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  File as FileIcon,
  FileCode2,
  FileImage,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  GitBranch,
  KeyRound,
  Link2,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  type CSSProperties,
  FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PreviewPane } from "@/components/preview-pane";
import { TelarMark } from "@/components/telar-mark";
import { handleGenerateClientError } from "@/lib/client/errors";
import { downloadProjectZip } from "@/lib/export/zip";
import { applyGeneratedChange } from "@/lib/project/apply-files";
import {
  createDefaultGenerationSkill,
  isGithubGenerationSkill,
  type GithubGenerationSkill,
} from "@/lib/project/generation-skill";
import {
  addReferenceUploads,
  getReferenceKindForName,
  REFERENCE_ACCEPT_ATTRIBUTE,
  ReferenceValidationError,
  referenceToDataUrl,
  removeProjectReference,
  type ReferenceUpload,
} from "@/lib/project/references";
import type {
  ChatMessage,
  GeneratedChange,
  Project,
  ProjectReference,
  ProjectSummary,
  ProjectVersion,
  ProviderId,
} from "@/lib/project/types";
import { migrateLegacyStorage } from "@/lib/storage/migrate-legacy";
import {
  createProject,
  deleteProject,
  listProjectSummaries,
  loadActiveProjectId,
  loadProject,
  loadProviderPreferences,
  saveActiveProjectId,
  saveProject,
  saveProviderPreferences,
} from "@/lib/storage/projects";

const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-5",
  "claude-cli": "",
  "codex-cli": "",
};

type ActiveDrawer = "settings" | "files" | "projects" | null;
type SkillNotice = { tone: "success" | "error"; message: string };

const promptExamples = [
  "Landing page para uma cafeteria de bairro",
  "Dashboard simples de vendas com cards e grafico",
  "Tela de login acolhedora para um app financeiro",
];

const CHAT_WIDTH_KEY = "telar.chatWidth";
const CHAT_WIDTH_MIN = 320;
const CHAT_WIDTH_MAX = 900;
const SHELL_PADDING = 12;

export function Workspace() {
  const [project, setProject] = useState<Project | null>(null);
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [selectedPath, setSelectedPath] = useState("src/App.tsx");
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [apiKey, setApiKey] = useState("");
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [skillUrl, setSkillUrl] = useState("");
  const [skillNotice, setSkillNotice] = useState<SkillNotice | null>(null);
  const [isLoadingSkill, setIsLoadingSkill] = useState(false);
  const [referenceNotice, setReferenceNotice] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const [chatWidth, setChatWidth] = useState<number | null>(null);

  const [cliAgents, setCliAgents] = useState<{ claude: boolean; codex: boolean }>({
    claude: false,
    codex: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function bootWorkspace() {
      await migrateLegacyStorage();

      const preferences = loadProviderPreferences();
      if (preferences) {
        setProvider(preferences.provider);
        setModel(preferences.model);
      }

      const existingProjects = await listProjectSummaries();
      let activeProject: Project | undefined;
      const activeProjectId = loadActiveProjectId();

      if (activeProjectId) {
        activeProject = await loadProject(activeProjectId);
      }

      if (!activeProject && existingProjects[0]) {
        activeProject = await loadProject(existingProjects[0].id);
      }

      if (!activeProject) {
        activeProject = await saveProject(createProject());
      }

      if (cancelled) return;
      setProject(activeProject);
      setSelectedPath(getPreferredSelectedPath(activeProject, "src/App.tsx"));
      saveActiveProjectId(activeProject.id);
      setSummaries(await listProjectSummaries());
    }

    void bootWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeDrawer !== "settings") return;

    const focusTimer = window.setTimeout(() => {
      apiKeyInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [activeDrawer, settingsNotice]);

  useEffect(() => {
    if (!projectMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProjectMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [projectMenuOpen]);

  useEffect(() => {
    // Persisted splitter width is only available client-side, so it must be read
    // after mount rather than during render.
    const saved = Number(window.localStorage.getItem(CHAT_WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= CHAT_WIDTH_MIN && saved <= CHAT_WIDTH_MAX) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatWidth(saved);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/agents")
      .then((response) => (response.ok ? response.json() : { claude: false, codex: false }))
      .then((data) => {
        if (active) setCliAgents({ claude: Boolean(data.claude), codex: Boolean(data.codex) });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const filePaths = useMemo(() => {
    return Object.keys(project?.files ?? {}).sort((a, b) => a.localeCompare(b));
  }, [project?.files]);

  const selectedContent = project?.files[selectedPath] ?? "";
  const selectedReference = project?.references.find((reference) => reference.projectPath === selectedPath);

  const isCliProvider = provider === "claude-cli" || provider === "codex-cli";
  const generatingMessage = isCliProvider
    ? `Gerando com o binário local (${provider === "claude-cli" ? "Claude" : "Codex"}). A CLI inicializa a cada pedido, então isso pode levar até ~2 min. Pode aguardar.`
    : "Gerando a tela…";

  async function refreshSummaries() {
    setSummaries(await listProjectSummaries());
  }

  function openDrawer(drawer: Exclude<ActiveDrawer, null>) {
    setActiveDrawer(drawer);
    if (drawer === "settings" && project) {
      setSkillUrl(project.generationSkill.source === "github" ? project.generationSkill.sourceUrl : "");
      setSkillNotice(null);
    }
    if (drawer !== "projects") {
      setConfirmingDeleteId(null);
    }
  }

  function closeDrawer() {
    setActiveDrawer(null);
    setConfirmingDeleteId(null);
  }

  function clampChatWidth(width: number): number {
    const shell = shellRef.current;
    const viewportMax = shell ? shell.getBoundingClientRect().width * 0.62 : CHAT_WIDTH_MAX;
    return Math.max(CHAT_WIDTH_MIN, Math.min(width, Math.min(CHAT_WIDTH_MAX, viewportMax)));
  }

  function handleSplitterPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const shell = shellRef.current;
    if (!shell) return;

    let latest = chatWidth ?? shell.querySelector(".chat-region")?.getBoundingClientRect().width ?? 420;

    function onMove(moveEvent: PointerEvent) {
      const rect = shell!.getBoundingClientRect();
      latest = clampChatWidth(moveEvent.clientX - rect.left - SHELL_PADDING);
      setChatWidth(latest);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("is-resizing");
      window.localStorage.setItem(CHAT_WIDTH_KEY, String(Math.round(latest)));
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.classList.add("is-resizing");
  }

  function handleSplitterKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 16;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const base = chatWidth ?? shellRef.current?.querySelector(".chat-region")?.getBoundingClientRect().width ?? 420;
    const next = clampChatWidth(event.key === "ArrowLeft" ? base - step : base + step);
    setChatWidth(next);
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(Math.round(next)));
  }

  async function persist(nextProject: Project) {
    const saved = await saveProject(nextProject);
    setProject(saved);
    saveActiveProjectId(saved.id);
    await refreshSummaries();
    return saved;
  }

  async function handleNewProject() {
    const nextProject = await saveProject(createProject("Untitled Project"));
    setProject(nextProject);
    setSelectedPath("src/App.tsx");
    saveActiveProjectId(nextProject.id);
    setConfirmingDeleteId(null);
    await refreshSummaries();
  }

  async function handleDeleteProject(projectId: string) {
    if (!project) return;

    await deleteProject(projectId);
    const nextSummaries = await listProjectSummaries();
    setConfirmingDeleteId(null);

    if (projectId !== project.id) {
      setSummaries(nextSummaries);
      return;
    }

    let nextProject: Project | undefined;
    if (nextSummaries[0]) {
      nextProject = await loadProject(nextSummaries[0].id);
    }

    if (!nextProject) {
      nextProject = await saveProject(createProject());
    }

    setProject(nextProject);
    setSelectedPath(getPreferredSelectedPath(nextProject, "src/App.tsx"));
    saveActiveProjectId(nextProject.id);
    setSummaries(await listProjectSummaries());
  }

  async function handleSelectProject(projectId: string) {
    const nextProject = await loadProject(projectId);
    if (!nextProject) return;
    setProject(nextProject);
    setSelectedPath(getPreferredSelectedPath(nextProject, selectedPath));
    saveActiveProjectId(nextProject.id);
    setConfirmingDeleteId(null);
  }

  function handleProviderChange(nextProvider: ProviderId) {
    setProvider(nextProvider);
    const nextModel = DEFAULT_MODELS[nextProvider];
    setModel(nextModel);
    saveProviderPreferences({ provider: nextProvider, model: nextModel });
  }

  async function handleRestore(versionId: string) {
    if (!project || isGenerating) return;
    const version = project.versions.find((entry) => entry.id === versionId);
    if (!version) return;

    const restored: Project = {
      ...project,
      files: { ...version.files },
      updatedAt: new Date().toISOString(),
    };
    const saved = await persist(restored);
    setSelectedPath(getPreferredSelectedPath(saved, selectedPath));
    const label = version.prompt.length > 60 ? `${version.prompt.slice(0, 60)}…` : version.prompt;
    setNotice(`Versão restaurada: "${label}"`);
  }

  function handleModelChange(nextModel: string) {
    setModel(nextModel);
    saveProviderPreferences({ provider, model: nextModel });
  }

  async function handleRename(name: string) {
    if (!project) return;
    setProject({ ...project, name });
    await persist({ ...project, name });
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || isGenerating) return;

    const prompt = draft.trim();
    if (!prompt) return;

    if (!isCliProvider && !apiKey.trim()) {
      openDrawer("settings");
      setSettingsNotice("Adicione sua chave de API para criar a tela.");
      setNotice(null);
      return;
    }

    setNotice(null);
    setSettingsNotice(null);
    setReferenceNotice(null);
    setDraft("");
    setIsGenerating(true);

    const userMessage = createMessage("user", prompt);
    setProject({ ...project, messages: [...project.messages, userMessage] });

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          model,
          prompt,
          messages: project.messages.slice(-8),
          files: project.files,
          references: project.references,
          generationSkill: project.generationSkill,
        }),
      });

      const payload = (await response.json()) as
        | { change: GeneratedChange }
        | { error?: { message?: string } };

      if (!response.ok || !("change" in payload)) {
        throw new Error(handleGenerateClientError(payload));
      }

      const applied = applyGeneratedChange(project.files, payload.change);
      if (!applied.ok) {
        throw new Error(applied.error);
      }

      const version: ProjectVersion = {
        id: createLocalId("ver"),
        prompt,
        summary: payload.change.summary,
        createdAt: new Date().toISOString(),
        files: applied.files,
      };
      const assistantMessage = createMessage(
        "assistant",
        formatAssistantMessage(payload.change),
        false,
        version.id,
      );
      const nextProject: Project = {
        ...project,
        files: applied.files,
        messages: [...project.messages, userMessage, assistantMessage],
        versions: [...project.versions, version],
        updatedAt: new Date().toISOString(),
      };

      await persist(nextProject);
      if (applied.changedPaths[0]) {
        setSelectedPath(applied.changedPaths[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      const friendlyMessage = `Nao consegui atualizar a tela. ${message}`;
      const assistantMessage = createMessage("assistant", friendlyMessage, true);
      await persist({
        ...project,
        messages: [...project.messages, userMessage, assistantMessage],
        updatedAt: new Date().toISOString(),
      });
      setNotice(friendlyMessage);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleFileChange(content: string) {
    if (!project || !selectedPath || selectedReference?.kind === "binary") return;
    const nextProject = {
      ...project,
      files: { ...project.files, [selectedPath]: content },
      updatedAt: new Date().toISOString(),
    };
    setProject(nextProject);
    void saveProject(nextProject).then(() => refreshSummaries());
  }

  async function handleExport() {
    if (!project) return;
    await downloadProjectZip(project.files, project.name, project.references);
  }

  async function handleReferenceInput(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    await handleReferenceFiles(input.files);
    input.value = "";
  }

  async function handleReferenceFiles(files: FileList | null) {
    if (!project || !files || files.length === 0) return;

    try {
      const uploads = await Promise.all(Array.from(files).map(readReferenceUpload));
      const nextProject = addReferenceUploads(project, uploads);
      await persist(nextProject);
      setReferenceNotice(
        uploads.length === 1 ? "Referencia anexada." : `${uploads.length} referencias anexadas.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao anexar referencia.";
      setReferenceNotice(`Nao consegui anexar. ${message}`);
    }
  }

  async function handleLoadGenerationSkill() {
    if (!project || isLoadingSkill) return;

    const url = skillUrl.trim();
    if (!url) {
      setSkillNotice({ tone: "error", message: "Cole uma URL publica de SKILL.md do GitHub." });
      return;
    }

    setIsLoadingSkill(true);
    setSkillNotice(null);
    setSettingsNotice(null);

    try {
      const response = await fetch("/api/skills/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as GithubGenerationSkill | { error?: { message?: string } };

      if (!response.ok || !isGithubGenerationSkill(payload)) {
        const message = "error" in payload ? payload.error?.message : undefined;
        throw new Error(message || "Resposta invalida ao carregar a skill.");
      }

      await persist({
        ...project,
        generationSkill: payload,
        updatedAt: new Date().toISOString(),
      });
      setSkillUrl(payload.sourceUrl);
      setSkillNotice({ tone: "success", message: "Skill customizada ativa." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar a skill.";
      setSkillNotice({ tone: "error", message: `Nao consegui carregar a skill. ${message}` });
    } finally {
      setIsLoadingSkill(false);
    }
  }

  async function handleRemoveGenerationSkill() {
    if (!project || project.generationSkill.source !== "github") return;

    await persist({
      ...project,
      generationSkill: createDefaultGenerationSkill(),
      updatedAt: new Date().toISOString(),
    });
    setSkillUrl("");
    setSkillNotice({ tone: "success", message: "Skill padrao restaurada." });
  }

  async function handleRemoveReference(reference: ProjectReference) {
    if (!project) return;

    const nextProject = removeProjectReference(project, reference.id);
    await persist(nextProject);
    if (selectedPath === reference.projectPath) {
      setSelectedPath(getPreferredSelectedPath(nextProject, "src/App.tsx"));
    }
    setReferenceNotice("Referencia removida.");
  }

  if (!project) {
    return (
      <main className="boot-screen">
        <Loader2 className="spin" size={26} aria-hidden="true" />
        <span>Abrindo o projeto</span>
      </main>
    );
  }

  return (
    <main
      ref={shellRef}
      className="app-shell"
      style={chatWidth ? ({ "--chat-width": `${chatWidth}px` } as CSSProperties) : undefined}
    >
      <input
        ref={referenceInputRef}
        className="sr-only"
        aria-label="Anexar referências"
        type="file"
        accept={REFERENCE_ACCEPT_ATTRIBUTE}
        multiple
        onChange={(event) => void handleReferenceInput(event)}
      />

      <header className="workspace-topbar">
        <div className="product-lockup">
          <TelarMark className="brand-mark" />
          <div className="brand-copy">
            <p>Telar</p>
            <h1>Crie telas descrevendo o que voce precisa</h1>
          </div>
        </div>

        <div className="topbar-project">
          <label className="sr-only" htmlFor="project-name">
            Nome do projeto
          </label>
          <div className="project-selector" ref={projectMenuRef}>
            <span className="project-selector-eyebrow" aria-hidden="true">
              Projeto
            </span>
            <input
              id="project-name"
              className="project-name-input"
              value={project.name}
              onChange={(event) => setProject({ ...project, name: event.target.value })}
              onBlur={(event) => void handleRename(event.target.value || "Untitled Project")}
            />
            <button
              type="button"
              className={`project-selector-toggle ${projectMenuOpen ? "is-open" : ""}`}
              aria-label="Trocar de projeto"
              aria-haspopup="menu"
              aria-expanded={projectMenuOpen}
              onClick={() => setProjectMenuOpen((open) => !open)}
            >
              <ChevronDown className="project-selector-chevron" size={16} aria-hidden="true" />
            </button>

            {projectMenuOpen ? (
              <div className="project-menu" role="menu" aria-label="Trocar de projeto">
                <div className="project-menu-list">
                  {summaries.map((summary) => {
                    const isActive = summary.id === project.id;
                    return (
                      <button
                        key={summary.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        className={`project-menu-item ${isActive ? "is-active" : ""}`}
                        onClick={() => {
                          setProjectMenuOpen(false);
                          if (!isActive) void handleSelectProject(summary.id);
                        }}
                      >
                        <FolderOpen size={15} aria-hidden="true" />
                        <span className="project-menu-name">{summary.name}</span>
                        {isActive ? <CheckCircle2 size={15} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="project-menu-new"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    void handleNewProject();
                  }}
                >
                  <FolderPlus size={15} aria-hidden="true" />
                  <span>Novo projeto</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="topbar-actions" aria-label="Acoes do projeto">
          <button className="quiet-command" type="button" onClick={() => openDrawer("projects")}>
            <FolderKanban size={16} aria-hidden="true" />
            <span>Projetos</span>
          </button>
          <button className="quiet-command" type="button" onClick={() => openDrawer("settings")}>
            <Settings size={16} aria-hidden="true" />
            <span>Configurações</span>
          </button>
          <button className="quiet-command" type="button" onClick={() => openDrawer("files")}>
            <FolderOpen size={16} aria-hidden="true" />
            <span>Arquivos</span>
          </button>
        </nav>
      </header>

      <section className="workspace-region chat-region" aria-label="Chat">
        <div className="region-bar chat-bar">
          <div className="region-title">
            <Sparkles size={17} aria-hidden="true" />
            <span>Chat</span>
          </div>
        </div>

        <div className="message-list" aria-label="Conversa">
          {project.messages.length === 0 ? (
            <div className="empty-chat">
              <Bot size={22} aria-hidden="true" />
              <div>
                <p>Descreva a tela que voce quer criar.</p>
                <span>Comece com um destes exemplos:</span>
              </div>
              <div className="example-list">
                {promptExamples.map((example) => (
                  <button key={example} type="button" onClick={() => setDraft(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            project.messages.map((message) => {
              const restorable =
                message.role === "assistant" &&
                !message.error &&
                Boolean(message.versionId) &&
                project.versions.some((entry) => entry.id === message.versionId);

              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  restorable={restorable}
                  isGenerating={isGenerating}
                  onRestore={handleRestore}
                />
              );
            })
          )}
          {isGenerating ? (
            <article className="message assistant pending" aria-live="polite">
              <Loader2 className="spin" size={16} aria-hidden="true" />
              <p>{generatingMessage}</p>
            </article>
          ) : null}
        </div>

        {notice ? (
          <p className="notice" role="alert">
            {notice}
          </p>
        ) : null}

        {referenceNotice && activeDrawer !== "files" ? (
          <p className="notice reference-chat-notice" role="alert">
            {referenceNotice}
          </p>
        ) : null}

        <form className="prompt-form" onSubmit={handleGenerate}>
          <label className="prompt-label" htmlFor="prompt">
            Descreva a tela que voce quer criar
          </label>
          <textarea
            id="prompt"
            aria-label="Descreva a tela que você quer criar"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ex.: uma pagina de vendas com planos, depoimentos e botao de contato..."
            rows={5}
          />
          <div className="prompt-actions">
            <button
              className="secondary-command attach-command"
              type="button"
              onClick={() => referenceInputRef.current?.click()}
              disabled={isGenerating}
            >
              <Paperclip size={17} aria-hidden="true" />
              <span>Anexar</span>
            </button>
            <button className="primary-command" type="submit" disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="spin" size={17} aria-hidden="true" />
              ) : (
                <Send size={17} aria-hidden="true" />
              )}
              <span>{isGenerating ? "Generating" : "Generate"}</span>
            </button>
          </div>
        </form>
      </section>

      <div
        className="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar painéis"
        tabIndex={0}
        onPointerDown={handleSplitterPointerDown}
        onKeyDown={handleSplitterKeyDown}
      >
        <span className="pane-splitter-grip" aria-hidden="true" />
      </div>

      <PreviewPane files={project.files} references={project.references} isGenerating={isGenerating} />

      {activeDrawer ? (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="Fechar drawer"
            onClick={closeDrawer}
          />
          {activeDrawer === "settings" ? (
            <section className="side-drawer" aria-label="Configurações">
              <div className="drawer-header">
                <div>
                  <p>Configurar IA</p>
                  <h2>Configurações</h2>
                </div>
                <button
                  className="icon-only"
                  type="button"
                  aria-label="Fechar configurações"
                  onClick={closeDrawer}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              {settingsNotice ? (
                <p className="drawer-notice" role="alert">
                  {settingsNotice}
                </p>
              ) : null}

              <div className="drawer-stack">
                <div className="settings-card">
                  <label className="field-label" htmlFor="provider">
                    Serviço de IA
                  </label>
                  <div className="segmented" id="provider" aria-label="Provider">
                    <button
                      type="button"
                      className={provider === "openai" ? "is-selected" : ""}
                      onClick={() => handleProviderChange("openai")}
                    >
                      OpenAI
                    </button>
                    <button
                      type="button"
                      className={provider === "anthropic" ? "is-selected" : ""}
                      onClick={() => handleProviderChange("anthropic")}
                    >
                      Claude
                    </button>
                    {cliAgents.claude ? (
                      <button
                        type="button"
                        className={provider === "claude-cli" ? "is-selected" : ""}
                        onClick={() => handleProviderChange("claude-cli")}
                      >
                        Claude CLI
                      </button>
                    ) : null}
                    {cliAgents.codex ? (
                      <button
                        type="button"
                        className={provider === "codex-cli" ? "is-selected" : ""}
                        onClick={() => handleProviderChange("codex-cli")}
                      >
                        Codex CLI
                      </button>
                    ) : null}
                  </div>
                </div>

                {isCliProvider ? (
                  <p className="drawer-hint">Modo CLI: usa o binário local autenticado, sem API key.</p>
                ) : (
                  <div className="settings-card">
                    <label className="field-label" htmlFor="api-key">
                      API key
                    </label>
                    <div className="key-input">
                      <KeyRound size={16} aria-hidden="true" />
                      <input
                        ref={apiKeyInputRef}
                        id="api-key"
                        aria-label="API key"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        type="password"
                        autoComplete="off"
                        placeholder="Cole sua chave aqui"
                      />
                    </div>
                  </div>
                )}

                <div className="settings-card">
                  <label className="field-label" htmlFor="model">
                    Modelo{isCliProvider ? " (opcional)" : ""}
                  </label>
                  <input
                    id="model"
                    className="text-input"
                    value={model}
                    onChange={(event) => handleModelChange(event.target.value)}
                  />
                </div>

                <div className="settings-card generation-skill-card">
                  <div className="skill-card-header">
                    <div>
                      <span className="field-label">Instruções do prompt</span>
                      <h3>Skill de geração</h3>
                    </div>
                    <span className={`skill-source-pill ${project.generationSkill.source}`}>
                      {project.generationSkill.source === "github" ? "GitHub" : "Padrão"}
                    </span>
                  </div>

                  <div className="active-skill">
                    {project.generationSkill.source === "github" ? (
                      <GitBranch size={18} aria-hidden="true" />
                    ) : (
                      <Sparkles size={18} aria-hidden="true" />
                    )}
                    <div>
                      <p>{project.generationSkill.name}</p>
                      <small>
                        {project.generationSkill.source === "github"
                          ? project.generationSkill.sourceUrl
                          : "Padrão ativo"}
                      </small>
                    </div>
                  </div>

                  <label className="field-label" htmlFor="generation-skill-url">
                    URL pública do SKILL.md
                  </label>
                  <div className="skill-load-row">
                    <div className="key-input skill-url-input">
                      <Link2 size={16} aria-hidden="true" />
                      <input
                        id="generation-skill-url"
                        aria-label="URL pública do SKILL.md"
                        value={skillUrl}
                        onChange={(event) => setSkillUrl(event.target.value)}
                        type="url"
                        autoComplete="off"
                        placeholder="https://github.com/org/repo/blob/main/SKILL.md"
                      />
                    </div>
                    <button
                      className="secondary-command"
                      type="button"
                      onClick={() => void handleLoadGenerationSkill()}
                      disabled={isLoadingSkill}
                    >
                      {isLoadingSkill ? (
                        <Loader2 className="spin" size={16} aria-hidden="true" />
                      ) : (
                        <GitBranch size={16} aria-hidden="true" />
                      )}
                      <span>Carregar skill</span>
                    </button>
                  </div>

                  {skillNotice ? (
                    <p
                      className={`drawer-notice skill-notice ${skillNotice.tone}`}
                      role={skillNotice.tone === "error" ? "alert" : "status"}
                    >
                      {skillNotice.message}
                    </p>
                  ) : null}

                  <button
                    className="secondary-command restore-skill-command"
                    type="button"
                    onClick={() => void handleRemoveGenerationSkill()}
                    disabled={project.generationSkill.source !== "github"}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    <span>Remover skill</span>
                  </button>
                </div>
              </div>
            </section>
          ) : activeDrawer === "projects" ? (
            <section className="side-drawer projects-drawer" aria-label="Projetos">
              <div className="drawer-header">
                <div>
                  <p>Gerenciar projetos</p>
                  <h2>Projetos</h2>
                </div>
                <button
                  className="icon-only"
                  type="button"
                  aria-label="Fechar projetos"
                  onClick={closeDrawer}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <div className="drawer-actions project-drawer-actions">
                <button className="primary-command drawer-primary-command" type="button" onClick={() => void handleNewProject()}>
                  <FolderPlus size={17} aria-hidden="true" />
                  <span>Novo projeto</span>
                </button>
              </div>

              <div className="project-picker" aria-label="Projetos salvos">
                {summaries.map((summary) => {
                  const isActive = summary.id === project.id;
                  const isConfirming = confirmingDeleteId === summary.id;
                  const conversationLabel =
                    summary.messageCount === 1 ? "1 conversa" : `${summary.messageCount} conversas`;

                  return (
                    <article key={summary.id} className={`project-item ${isActive ? "is-active" : ""}`}>
                      <div className="project-row">
                        <div className="project-meta">
                          <div className="project-title-line">
                            <span className="project-name">{summary.name}</span>
                            {isActive ? (
                              <span className="active-project-pill">
                                <CheckCircle2 size={13} aria-hidden="true" />
                                <span>Ativo</span>
                              </span>
                            ) : null}
                          </div>
                          <small>{conversationLabel}</small>
                        </div>

                        <div className="project-row-actions">
                          <button
                            className="project-open"
                            type="button"
                            aria-label={`Abrir ${summary.name}`}
                            disabled={isActive}
                            onClick={() => void handleSelectProject(summary.id)}
                          >
                            <FolderOpen size={15} aria-hidden="true" />
                            <span>{isActive ? "Aberto" : "Abrir"}</span>
                          </button>
                          <button
                            className="project-delete"
                            type="button"
                            aria-label={`Excluir ${summary.name}`}
                            onClick={() => setConfirmingDeleteId(summary.id)}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {isConfirming ? (
                        <div className="project-confirm" role="group" aria-label={`Confirmar exclusão de ${summary.name}`}>
                          <span>Confirmar exclusão?</span>
                          <button
                            className="project-confirm-cancel"
                            type="button"
                            aria-label={`Cancelar exclusão de ${summary.name}`}
                            onClick={() => setConfirmingDeleteId(null)}
                          >
                            <X size={14} aria-hidden="true" />
                            <span>Cancelar</span>
                          </button>
                          <button
                            className="project-confirm-delete"
                            type="button"
                            aria-label={`Confirmar exclusão de ${summary.name}`}
                            onClick={() => void handleDeleteProject(summary.id)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            <span>Excluir</span>
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="side-drawer files-drawer" aria-label="Arquivos do projeto">
              <div className="drawer-header">
                <div>
                  <p>Exportar e editar</p>
                  <h2>Arquivos do projeto</h2>
                </div>
                <button
                  className="icon-only"
                  type="button"
                  aria-label="Fechar arquivos"
                  onClick={closeDrawer}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <div className="drawer-actions">
                <button className="secondary-command" type="button" onClick={() => void handleExport()}>
                  <Download size={17} aria-hidden="true" />
                  <span>Export ZIP</span>
                </button>
                <button
                  className="secondary-command"
                  type="button"
                  onClick={() => referenceInputRef.current?.click()}
                >
                  <Upload size={17} aria-hidden="true" />
                  <span>Adicionar referências</span>
                </button>
              </div>

              {referenceNotice ? (
                <p className="drawer-notice" role="alert">
                  {referenceNotice}
                </p>
              ) : null}

              <div className="file-grid">
                <div className="file-sidebar">
                  <nav className="file-tree" aria-label="Arquivos">
                    {filePaths.map((filePath) => (
                      <button
                        key={filePath}
                        type="button"
                        className={filePath === selectedPath ? "is-active" : ""}
                        onClick={() => setSelectedPath(filePath)}
                      >
                        <FileCode2 size={15} aria-hidden="true" />
                        <span>{filePath}</span>
                        {filePath === selectedPath ? <ChevronRight size={14} aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </nav>

                  <section className="reference-panel" aria-label="Referências">
                    <div className="reference-panel-title">
                      <div>
                        <h3>Referências</h3>
                        <span>{project.references.length}/10 arquivos</span>
                      </div>
                    </div>

                    {project.references.length === 0 ? (
                      <div className="reference-empty">
                        <Paperclip size={17} aria-hidden="true" />
                        <span>Nenhuma referência anexada.</span>
                      </div>
                    ) : (
                      <div className="reference-list">
                        {project.references.map((reference) => (
                          <article
                            key={reference.id}
                            className={`reference-item ${reference.projectPath === selectedPath ? "is-active" : ""}`}
                          >
                            <button
                              className="reference-open"
                              type="button"
                              aria-label={`Abrir referência ${reference.name}`}
                              onClick={() => setSelectedPath(reference.projectPath)}
                            >
                              {reference.kind === "text" ? (
                                <FileText size={15} aria-hidden="true" />
                              ) : reference.mimeType.startsWith("image/") ? (
                                <FileImage size={15} aria-hidden="true" />
                              ) : (
                                <FileIcon size={15} aria-hidden="true" />
                              )}
                              <span>{reference.name}</span>
                              <small>{formatReferenceMeta(reference)}</small>
                            </button>
                            <button
                              className="reference-remove"
                              type="button"
                              aria-label={`Remover referência ${reference.name}`}
                              onClick={() => void handleRemoveReference(reference)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {selectedReference?.kind === "binary" ? (
                  <ReferencePreview reference={selectedReference} />
                ) : (
                  <label className="editor-wrap">
                    <span>{selectedPath}</span>
                    <textarea
                      aria-label="Editor de arquivo"
                      value={selectedContent}
                      onChange={(event) => handleFileChange(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                )}
              </div>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}

function MessageItem({
  message,
  restorable,
  isGenerating,
  onRestore,
}: {
  message: ChatMessage;
  restorable: boolean;
  isGenerating: boolean;
  onRestore: (versionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible =
    message.role === "assistant" &&
    !message.error &&
    (message.content.length > 240 || message.content.split("\n").length > 4);

  return (
    <article className={`message ${message.role} ${message.error ? "error" : ""}`}>
      {message.role === "assistant" && !message.error ? (
        <div className="message-seal">
          <TelarMark size={15} title="Telar" />
          <span>Telar</span>
        </div>
      ) : null}
      <div className="message-body">
        <p className={collapsible && !expanded ? "is-clamped" : undefined}>{message.content}</p>
        {collapsible ? (
          <button
            type="button"
            className="message-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? "Ver menos" : "Ver mais"}
          </button>
        ) : null}
        {restorable ? (
          <button
            type="button"
            className="restore-version"
            onClick={() => onRestore(message.versionId!)}
            disabled={isGenerating}
            title="Restaurar os arquivos para esta versão"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Restaurar esta versão
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ReferencePreview({ reference }: { reference: ProjectReference }) {
  const dataUrl = referenceToDataUrl(reference);
  const isImage = Boolean(dataUrl && reference.mimeType.startsWith("image/"));

  return (
    <div className="editor-wrap reference-preview">
      <span>{reference.projectPath}</span>
      <div className="reference-preview-body">
        <div className="reference-preview-heading">
          {isImage ? <FileImage size={18} aria-hidden="true" /> : <FileIcon size={18} aria-hidden="true" />}
          <div>
            <p>{reference.name}</p>
            <small>{formatReferenceMeta(reference)}</small>
          </div>
        </div>

        {isImage && dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Reference previews use local data URLs.
          <img className="reference-preview-image" src={dataUrl} alt={reference.name} />
        ) : (
          <div className="reference-preview-empty">
            <FileIcon size={28} aria-hidden="true" />
            <p>Preview textual indisponivel para este arquivo.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function createLocalId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMessage(
  role: ChatMessage["role"],
  content: string,
  error = false,
  versionId?: string,
): ChatMessage {
  return {
    id: createLocalId("msg"),
    role,
    content,
    error,
    ...(versionId ? { versionId } : {}),
  };
}

function formatAssistantMessage(change: GeneratedChange): string {
  const notes = [...change.notes, ...change.errors].filter(Boolean);
  return notes.length > 0 ? `${change.summary}\n${notes.join("\n")}` : change.summary;
}

function getPreferredSelectedPath(project: Project, preferredPath: string): string {
  if (Object.hasOwn(project.files, preferredPath)) return preferredPath;
  if (project.references.some((reference) => reference.projectPath === preferredPath)) return preferredPath;
  if (Object.hasOwn(project.files, "src/App.tsx")) return "src/App.tsx";
  return Object.keys(project.files).sort((a, b) => a.localeCompare(b))[0] ?? "";
}

async function readReferenceUpload(file: File): Promise<ReferenceUpload> {
  const kind = getReferenceKindForName(file.name);
  if (!kind) {
    throw new ReferenceValidationError(`Tipo de arquivo nao suportado: ${file.name}`);
  }

  if (kind === "text") {
    return {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      content: await file.text(),
    };
  }

  return {
    name: file.name,
    mimeType: file.type,
    size: file.size,
    dataBase64: await readFileBase64(file),
  };
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function formatReferenceMeta(reference: ProjectReference): string {
  return `${reference.mimeType} - ${formatBytes(reference.size)}`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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
  MessagesSquare,
  PanelLeftClose,
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
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PreviewPane } from "@/components/preview-pane";
import { TelarMark } from "@/components/telar-mark";
import { handleGenerateClientError } from "@/lib/client/errors";
import { LOCALE_LABELS, LOCALES, useI18n } from "@/lib/i18n";
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

const PROMPT_EXAMPLE_KEYS = ["examples.0", "examples.1", "examples.2"] as const;

export function Workspace() {
  const { t, locale, setLocale } = useI18n();
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
  const [chatOpen, setChatOpen] = useState(false);

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
    if (!activeDrawer) return;

    const drawer = document.querySelector<HTMLElement>(".side-drawer");
    if (!drawer) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

    focusable()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveDrawer(null);
        setConfirmingDeleteId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [activeDrawer]);

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
    ? t("generating.cli", { name: provider === "claude-cli" ? "Claude" : "Codex" })
    : t("generating.screen");

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
    setNotice(t("notice.restored", { label }));
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
      setSettingsNotice(t("notice.apiKeyNeeded"));
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
      // The assistant reply is just a compact, restorable version marker (#1, #2…)
      // instead of a verbose summary of what changed.
      const assistantMessage = createMessage(
        "assistant",
        `#${project.versions.length + 1}`,
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
      const friendlyMessage = t("notice.updateFailed", { message });
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
        uploads.length === 1
          ? t("notice.refAttachedOne")
          : t("notice.refAttachedMany", { count: uploads.length }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao anexar referencia.";
      setReferenceNotice(t("notice.refAttachFailed", { message }));
    }
  }

  async function handleLoadGenerationSkill() {
    if (!project || isLoadingSkill) return;

    const url = skillUrl.trim();
    if (!url) {
      setSkillNotice({ tone: "error", message: t("skill.urlNeeded") });
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
        throw new Error(message || t("skill.invalid"));
      }

      await persist({
        ...project,
        generationSkill: payload,
        updatedAt: new Date().toISOString(),
      });
      setSkillUrl(payload.sourceUrl);
      setSkillNotice({ tone: "success", message: t("skill.active") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar a skill.";
      setSkillNotice({ tone: "error", message: t("skill.loadFailed", { message }) });
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
    setSkillNotice({ tone: "success", message: t("skill.restored") });
  }

  async function handleRemoveReference(reference: ProjectReference) {
    if (!project) return;

    const nextProject = removeProjectReference(project, reference.id);
    await persist(nextProject);
    if (selectedPath === reference.projectPath) {
      setSelectedPath(getPreferredSelectedPath(nextProject, "src/App.tsx"));
    }
    setReferenceNotice(t("notice.refRemoved"));
  }

  if (!project) {
    return (
      <main className="boot-screen">
        <Loader2 className="spin" size={26} aria-hidden="true" />
        <span>{t("boot.opening")}</span>
      </main>
    );
  }

  return (
    <main className="app-shell" data-chat-open={chatOpen}>
      <input
        ref={referenceInputRef}
        className="sr-only"
        aria-label={t("dock.attach")}
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
          </div>
        </div>

        <div className="topbar-project">
          <label className="sr-only" htmlFor="project-name">
            {t("topbar.projectName")}
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
              aria-label={t("topbar.switchProject")}
              aria-haspopup="menu"
              aria-expanded={projectMenuOpen}
              onClick={() => setProjectMenuOpen((open) => !open)}
            >
              <ChevronDown className="project-selector-chevron" size={16} aria-hidden="true" />
            </button>

            {projectMenuOpen ? (
              <div className="project-menu" role="menu" aria-label={t("topbar.switchProject")}>
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
                  <span>{t("projects.new")}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="topbar-actions" aria-label={t("topbar.projectActions")}>
          <button
            className={`quiet-command chat-toggle ${chatOpen ? "is-active" : ""}`}
            type="button"
            aria-pressed={chatOpen}
            aria-label={chatOpen ? t("chat.collapse") : t("chat.open")}
            onClick={() => setChatOpen((open) => !open)}
          >
            <MessagesSquare size={16} aria-hidden="true" />
            <span>{t("topbar.conversation")}</span>
          </button>
          <button className="quiet-command" type="button" onClick={() => openDrawer("projects")}>
            <FolderKanban size={16} aria-hidden="true" />
            <span>{t("topbar.projects")}</span>
          </button>
          <button className="quiet-command" type="button" onClick={() => openDrawer("files")}>
            <FolderOpen size={16} aria-hidden="true" />
            <span>{t("topbar.files")}</span>
          </button>
          <button className="quiet-command" type="button" onClick={() => openDrawer("settings")}>
            <Settings size={16} aria-hidden="true" />
            <span>{t("topbar.settings")}</span>
          </button>
        </nav>
      </header>

      <div className="workspace-body">
        {chatOpen ? (
          <button
            className="chat-backdrop"
            type="button"
            aria-label={t("chat.collapse")}
            onClick={() => setChatOpen(false)}
          />
        ) : null}

        <aside className="chat-region" aria-label={t("chat.title")}>
          <div className="region-bar chat-bar">
            <div className="region-title">
              <MessagesSquare size={17} aria-hidden="true" />
              <span>{t("chat.title")}</span>
            </div>
            <button
              className="icon-only chat-collapse"
              type="button"
              aria-label={t("chat.collapse")}
              onClick={() => setChatOpen(false)}
            >
              <PanelLeftClose size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="message-list" aria-label={t("chat.title")}>
          {project.messages.length === 0 ? (
            <div className="empty-chat">
              <Bot size={22} aria-hidden="true" />
              <div>
                <p>{t("chat.emptyTitle")}</p>
                <span>{t("chat.emptyHint")}</span>
              </div>
              <div className="example-list">
                {PROMPT_EXAMPLE_KEYS.map((key) => (
                  <button key={key} type="button" onClick={() => setDraft(t(key))}>
                    {t(key)}
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
        </aside>

        <div className="canvas">
          <PreviewPane files={project.files} references={project.references} isGenerating={isGenerating} />

          <form className="command-dock" onSubmit={handleGenerate}>
            <label className="sr-only" htmlFor="prompt">
              {t("dock.label")}
            </label>
            <button
              className="dock-attach"
              type="button"
              aria-label={t("dock.attach")}
              onClick={() => referenceInputRef.current?.click()}
              disabled={isGenerating}
            >
              <Paperclip size={18} aria-hidden="true" />
            </button>
            <textarea
              id="prompt"
              className="dock-input"
              aria-label={t("dock.label")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("dock.placeholder")}
              rows={1}
              disabled={isGenerating}
            />
            <button className="primary-command dock-generate" type="submit" disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="spin" size={17} aria-hidden="true" />
              ) : (
                <Send size={17} aria-hidden="true" />
              )}
              <span>{isGenerating ? t("dock.generating") : t("dock.generate")}</span>
            </button>
          </form>
        </div>
      </div>

      {activeDrawer ? (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            aria-label={t("drawer.close")}
            onClick={closeDrawer}
          />
          {activeDrawer === "settings" ? (
            <section className="side-drawer" aria-label={t("settings.title")}>
              <div className="drawer-header">
                <div>
                  <p>{t("settings.eyebrow")}</p>
                  <h2>{t("settings.title")}</h2>
                </div>
                <button
                  className="icon-only"
                  type="button"
                  aria-label={t("settings.close")}
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
                    {t("settings.aiService")}
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
                  <p className="drawer-hint">{t("settings.cliHint")}</p>
                ) : (
                  <div className="settings-card">
                    <label className="field-label" htmlFor="api-key">
                      {t("settings.apiKey")}
                    </label>
                    <div className="key-input">
                      <KeyRound size={16} aria-hidden="true" />
                      <input
                        ref={apiKeyInputRef}
                        id="api-key"
                        aria-label={t("settings.apiKey")}
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        type="password"
                        autoComplete="off"
                        placeholder={t("settings.apiKeyPlaceholder")}
                      />
                    </div>
                  </div>
                )}

                <div className="settings-card">
                  <label className="field-label" htmlFor="model">
                    {t("settings.model")}
                    {isCliProvider ? t("settings.modelOptional") : ""}
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
                      <span className="field-label">{t("settings.promptInstructions")}</span>
                      <h3>{t("settings.generationSkill")}</h3>
                    </div>
                    <span className={`skill-source-pill ${project.generationSkill.source}`}>
                      {project.generationSkill.source === "github" ? "GitHub" : t("settings.badgeDefault")}
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
                          : t("settings.defaultActive")}
                      </small>
                    </div>
                  </div>

                  <label className="field-label" htmlFor="generation-skill-url">
                    {t("settings.skillUrl")}
                  </label>
                  <div className="skill-load-row">
                    <div className="key-input skill-url-input">
                      <Link2 size={16} aria-hidden="true" />
                      <input
                        id="generation-skill-url"
                        aria-label={t("settings.skillUrl")}
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
                      <span>{t("settings.loadSkill")}</span>
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
                    <span>{t("settings.removeSkill")}</span>
                  </button>
                </div>

                <div className="settings-card">
                  <label className="field-label" htmlFor="language">
                    {t("settings.language")}
                  </label>
                  <div className="segmented" id="language" aria-label={t("settings.language")}>
                    {LOCALES.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        className={locale === loc ? "is-selected" : ""}
                        aria-pressed={locale === loc}
                        onClick={() => setLocale(loc)}
                      >
                        {LOCALE_LABELS[loc]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : activeDrawer === "projects" ? (
            <section className="side-drawer projects-drawer" aria-label={t("projects.title")}>
              <div className="drawer-header">
                <div>
                  <p>{t("projects.eyebrow")}</p>
                  <h2>{t("projects.title")}</h2>
                </div>
                <button
                  className="icon-only"
                  type="button"
                  aria-label={t("projects.close")}
                  onClick={closeDrawer}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <div className="drawer-actions project-drawer-actions">
                <button className="primary-command drawer-primary-command" type="button" onClick={() => void handleNewProject()}>
                  <FolderPlus size={17} aria-hidden="true" />
                  <span>{t("projects.new")}</span>
                </button>
              </div>

              <div className="project-picker" aria-label={t("projects.title")}>
                {summaries.map((summary) => {
                  const isActive = summary.id === project.id;
                  const isConfirming = confirmingDeleteId === summary.id;
                  const conversationLabel =
                    summary.messageCount === 1
                      ? t("projects.conversationsOne")
                      : t("projects.conversationsMany", { count: summary.messageCount });

                  return (
                    <article key={summary.id} className={`project-item ${isActive ? "is-active" : ""}`}>
                      <div className="project-row">
                        <div className="project-meta">
                          <div className="project-title-line">
                            <span className="project-name">{summary.name}</span>
                            {isActive ? (
                              <span className="active-project-pill">
                                <CheckCircle2 size={13} aria-hidden="true" />
                                <span>{t("projects.active")}</span>
                              </span>
                            ) : null}
                          </div>
                          <small>{conversationLabel}</small>
                        </div>

                        <div className="project-row-actions">
                          <button
                            className="project-open"
                            type="button"
                            aria-label={t("projects.openAria", { name: summary.name })}
                            disabled={isActive}
                            onClick={() => void handleSelectProject(summary.id)}
                          >
                            <FolderOpen size={15} aria-hidden="true" />
                            <span>{isActive ? t("projects.opened") : t("projects.open")}</span>
                          </button>
                          <button
                            className="project-delete"
                            type="button"
                            aria-label={t("projects.deleteAria", { name: summary.name })}
                            onClick={() => setConfirmingDeleteId(summary.id)}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {isConfirming ? (
                        <div className="project-confirm" role="group" aria-label={t("projects.confirmDeleteAria", { name: summary.name })}>
                          <span>{t("projects.confirmDelete")}</span>
                          <button
                            className="project-confirm-cancel"
                            type="button"
                            aria-label={t("projects.cancelDeleteAria", { name: summary.name })}
                            onClick={() => setConfirmingDeleteId(null)}
                          >
                            <X size={14} aria-hidden="true" />
                            <span>{t("projects.cancel")}</span>
                          </button>
                          <button
                            className="project-confirm-delete"
                            type="button"
                            aria-label={t("projects.confirmDeleteAria", { name: summary.name })}
                            onClick={() => void handleDeleteProject(summary.id)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            <span>{t("projects.delete")}</span>
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="side-drawer files-drawer" aria-label={t("files.title")}>
              <div className="drawer-header">
                <div>
                  <p>{t("files.eyebrow")}</p>
                  <h2>{t("files.title")}</h2>
                </div>
                <button
                  className="icon-only"
                  type="button"
                  aria-label={t("files.close")}
                  onClick={closeDrawer}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <div className="drawer-actions">
                <button className="secondary-command" type="button" onClick={() => void handleExport()}>
                  <Download size={17} aria-hidden="true" />
                  <span>{t("files.exportZip")}</span>
                </button>
                <button
                  className="secondary-command"
                  type="button"
                  onClick={() => referenceInputRef.current?.click()}
                >
                  <Upload size={17} aria-hidden="true" />
                  <span>{t("files.addReferences")}</span>
                </button>
              </div>

              {referenceNotice ? (
                <p className="drawer-notice" role="alert">
                  {referenceNotice}
                </p>
              ) : null}

              <div className="file-grid">
                <div className="file-sidebar">
                  <nav className="file-tree" aria-label={t("files.filesLabel")}>
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

                  <section className="reference-panel" aria-label={t("files.references")}>
                    <div className="reference-panel-title">
                      <div>
                        <h3>{t("files.references")}</h3>
                        <span>{t("files.referencesCount", { count: project.references.length })}</span>
                      </div>
                    </div>

                    {project.references.length === 0 ? (
                      <div className="reference-empty">
                        <Paperclip size={17} aria-hidden="true" />
                        <span>{t("files.noReferences")}</span>
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
                              aria-label={t("files.openRefAria", { name: reference.name })}
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
                              aria-label={t("files.removeRefAria", { name: reference.name })}
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
                      aria-label={t("files.editor")}
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
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const collapsible =
    message.role === "assistant" &&
    !message.error &&
    (message.content.length > 240 || message.content.split("\n").length > 4);

  return (
    <article className={`message ${message.role} ${message.error ? "error" : ""} ${restorable ? "version" : ""}`}>
      {message.role === "user" ? <span className="message-label">{t("chat.you")}</span> : null}
      {message.role === "assistant" && !message.error ? (
        <div className="message-seal">
          <TelarMark size={15} title="Telar" />
          <span>Telar</span>
          {restorable ? <span className="version-tag">{message.content}</span> : null}
        </div>
      ) : null}
      <div className="message-body">
        {restorable ? null : (
          <p className={collapsible && !expanded ? "is-clamped" : undefined}>{message.content}</p>
        )}
        {collapsible ? (
          <button
            type="button"
            className="message-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? t("chat.seeLess") : t("chat.seeMore")}
          </button>
        ) : null}
        {restorable ? (
          <button
            type="button"
            className="restore-version"
            onClick={() => onRestore(message.versionId!)}
            disabled={isGenerating}
            title={t("chat.restoreTitle")}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {t("chat.restore")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ReferencePreview({ reference }: { reference: ProjectReference }) {
  const { t } = useI18n();
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
            <p>{t("files.previewUnavailable")}</p>
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

function getPreferredSelectedPath(project: Project, preferredPath: string): string {
  if (Object.hasOwn(project.files, preferredPath)) return preferredPath;
  if (project.references.some((reference) => reference.projectPath === preferredPath)) return preferredPath;
  if (Object.hasOwn(project.files, "src/App.tsx")) return "src/App.tsx";
  return Object.keys(project.files).sort((a, b) => a.localeCompare(b))[0] ?? "";
}

async function readReferenceUpload(file: File): Promise<ReferenceUpload> {
  const kind = getReferenceKindForName(file.name);
  if (!kind) {
    throw new ReferenceValidationError(`Unsupported file type: ${file.name}`);
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

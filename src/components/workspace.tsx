"use client";

import {
  Bot,
  ChevronRight,
  Download,
  FileCode2,
  FolderOpen,
  FolderPlus,
  KeyRound,
  Loader2,
  Plus,
  Send,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { PreviewPane } from "@/components/preview-pane";
import { handleGenerateClientError } from "@/lib/client/errors";
import { downloadProjectZip } from "@/lib/export/zip";
import { applyGeneratedChange } from "@/lib/project/apply-files";
import type {
  ChatMessage,
  GeneratedChange,
  Project,
  ProjectSummary,
  ProviderId,
} from "@/lib/project/types";
import {
  createProject,
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
};

type ActiveDrawer = "settings" | "files" | null;

const promptExamples = [
  "Landing page para uma cafeteria de bairro",
  "Dashboard simples de vendas com cards e grafico",
  "Tela de login acolhedora para um app financeiro",
];

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
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootWorkspace() {
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
      setSelectedPath(activeProject.files["src/App.tsx"] ? "src/App.tsx" : Object.keys(activeProject.files)[0]);
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

  const filePaths = useMemo(() => {
    return Object.keys(project?.files ?? {}).sort((a, b) => a.localeCompare(b));
  }, [project?.files]);

  const selectedContent = project?.files[selectedPath] ?? "";

  async function refreshSummaries() {
    setSummaries(await listProjectSummaries());
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
    await refreshSummaries();
  }

  async function handleSelectProject(projectId: string) {
    const nextProject = await loadProject(projectId);
    if (!nextProject) return;
    setProject(nextProject);
    setSelectedPath(nextProject.files[selectedPath] ? selectedPath : "src/App.tsx");
    saveActiveProjectId(nextProject.id);
  }

  function handleProviderChange(nextProvider: ProviderId) {
    setProvider(nextProvider);
    const nextModel = DEFAULT_MODELS[nextProvider];
    setModel(nextModel);
    saveProviderPreferences({ provider: nextProvider, model: nextModel });
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

    if (!apiKey.trim()) {
      setActiveDrawer("settings");
      setSettingsNotice("Adicione sua chave de API para criar a tela.");
      setNotice(null);
      return;
    }

    setNotice(null);
    setSettingsNotice(null);
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

      const assistantMessage = createMessage("assistant", formatAssistantMessage(payload.change));
      const nextProject: Project = {
        ...project,
        files: applied.files,
        messages: [...project.messages, userMessage, assistantMessage],
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
    if (!project || !selectedPath) return;
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
    await downloadProjectZip(project.files, project.name);
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
    <main className="app-shell">
      <header className="workspace-topbar">
        <div className="product-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span>LF</span>
          </div>
          <div className="brand-copy">
            <p>figma-fake</p>
            <h1>Crie telas descrevendo o que voce precisa</h1>
          </div>
        </div>

        <div className="topbar-project">
          <label className="sr-only" htmlFor="project-name">
            Nome do projeto
          </label>
          <input
            id="project-name"
            className="project-name-input"
            value={project.name}
            onChange={(event) => setProject({ ...project, name: event.target.value })}
            onBlur={(event) => void handleRename(event.target.value || "Untitled Project")}
          />
        </div>

        <nav className="topbar-actions" aria-label="Acoes do projeto">
          <button className="quiet-command" type="button" onClick={() => void handleNewProject()}>
            <Plus size={16} aria-hidden="true" />
            <span>Novo</span>
          </button>
          <button className="quiet-command" type="button" onClick={() => setActiveDrawer("settings")}>
            <Settings size={16} aria-hidden="true" />
            <span>Configurações</span>
          </button>
          <button className="quiet-command" type="button" onClick={() => setActiveDrawer("files")}>
            <FolderOpen size={16} aria-hidden="true" />
            <span>Arquivos</span>
          </button>
        </nav>
      </header>

      <PreviewPane files={project.files} />

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
            project.messages.map((message) => (
              <article key={message.id} className={`message ${message.role} ${message.error ? "error" : ""}`}>
                {message.role === "user" ? (
                  <UserRound size={16} aria-hidden="true" />
                ) : (
                  <Bot size={16} aria-hidden="true" />
                )}
                <p>{message.content}</p>
              </article>
            ))
          )}
        </div>

        {notice ? (
          <p className="notice" role="alert">
            {notice}
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
          <button className="primary-command" type="submit" disabled={isGenerating}>
            {isGenerating ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
            <span>{isGenerating ? "Generating" : "Generate"}</span>
          </button>
        </form>
      </section>

      {activeDrawer ? (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="Fechar drawer"
            onClick={() => setActiveDrawer(null)}
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
                  onClick={() => setActiveDrawer(null)}
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
                  </div>
                </div>

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

                <div className="settings-card">
                  <label className="field-label" htmlFor="model">
                    Modelo
                  </label>
                  <input
                    id="model"
                    className="text-input"
                    value={model}
                    onChange={(event) => handleModelChange(event.target.value)}
                  />
                </div>
              </div>
            </section>
          ) : (
            <section className="side-drawer files-drawer" aria-label="Arquivos do projeto">
              <div className="drawer-header">
                <div>
                  <p>Ver arquivos do projeto</p>
                  <h2>Arquivos do projeto</h2>
                </div>
                <button
                  className="icon-only"
                  type="button"
                  aria-label="Fechar arquivos"
                  onClick={() => setActiveDrawer(null)}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <div className="drawer-actions">
                <button className="secondary-command" type="button" onClick={() => void handleNewProject()}>
                  <FolderPlus size={17} aria-hidden="true" />
                  <span>Novo projeto</span>
                </button>
                <button className="secondary-command" type="button" onClick={() => void handleExport()}>
                  <Download size={17} aria-hidden="true" />
                  <span>Export ZIP</span>
                </button>
              </div>

              {summaries.length > 0 ? (
                <div className="project-picker" aria-label="Projetos salvos">
                  {summaries.map((summary) => (
                    <button
                      key={summary.id}
                      className={summary.id === project.id ? "is-active" : ""}
                      type="button"
                      onClick={() => void handleSelectProject(summary.id)}
                    >
                      <span>{summary.name}</span>
                      <small>{summary.messageCount} conversas</small>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="file-grid">
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
                <label className="editor-wrap">
                  <span>{selectedPath}</span>
                  <textarea
                    aria-label="Editor de arquivo"
                    value={selectedContent}
                    onChange={(event) => handleFileChange(event.target.value)}
                    spellCheck={false}
                  />
                </label>
              </div>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}

function createMessage(role: ChatMessage["role"], content: string, error = false): ChatMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    error,
  };
}

function formatAssistantMessage(change: GeneratedChange): string {
  const notes = [...change.notes, ...change.errors].filter(Boolean);
  return notes.length > 0 ? `${change.summary}\n${notes.join("\n")}` : change.summary;
}

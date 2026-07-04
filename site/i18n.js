/* Telar landing — lightweight i18n.
   Default locale is always en-US; switchable to pt-BR.
   Mirrors the app convention (default "en", labels English/Português).
   Stored under a landing-scoped key so it never clashes with the app. */
(function () {
  "use strict";

  var STORAGE_KEY = "telar.landing.locale";
  var DEFAULT = "en";

  var DICT = {
    en: {
      "meta.title": "Telar — weave interfaces from a prompt",
      "meta.description": "A local-first AI workspace that turns a prompt into a real, editable React interface — rendered live in your browser. Bring your own AI. Nothing leaves your machine.",

      "nav.features": "Features",
      "nav.showcase": "Showcase",
      "nav.quickstart": "Quickstart",

      "hero.badge": "✷ Local-first · open source",
      "hero.title": "Weave <em>interfaces</em><br />from a single prompt.",
      "hero.sub": "Telar is Portuguese for <b>loom</b>. Describe a screen and it weaves the code — a real, editable React app rendering live in your browser. Local-first, bring your own AI.",
      "hero.cta_primary": "Get started on GitHub",
      "hero.cta_secondary": "See it in action ↓",
      "hero.note": "No account. No backend. Your projects live in the browser.",
      "hero.frameTitle": "telar · live preview",
      "hero.promptLabel": "Prompt",
      "hero.promptText": "“A SaaS analytics dashboard with KPI cards, a revenue chart and a traffic donut.”",

      "trust.local": "🔒 Local-first & private",
      "trust.byoai": "🧠 Bring your own AI",
      "trust.oss": "⚖️ Open source (MIT)",

      "value.1.title": "Prompt to UI",
      "value.1.desc": "Describe a screen in plain language and get a complete, editable React project — not a screenshot, real code.",
      "value.2.title": "Live in-browser preview",
      "value.2.desc": "The generated app runs instantly via WebContainers — a full Vite dev server, right in your tab.",
      "value.3.title": "Local-first & private",
      "value.3.desc": "Projects live in your browser (IndexedDB). You bring your own AI key or a local CLI. Nothing is uploaded.",

      "features.kicker": "Everything you need",
      "features.title": "A workspace, not a toy",
      "feat.1.title": "Prompt to UI",
      "feat.1.desc": "Describe a screen and get a complete, editable React project.",
      "feat.2.title": "Live preview",
      "feat.2.desc": "Runs in-browser via WebContainers, with a light mock mode for tests.",
      "feat.3.title": "Projects",
      "feat.3.desc": "Create, switch, rename and delete — each keeps its own history.",
      "feat.4.title": "Versions",
      "feat.4.desc": "Every generation is a restorable snapshot.",
      "feat.5.title": "References",
      "feat.5.desc": "Attach text and image files to guide generation.",
      "feat.6.title": "Bring your own AI",
      "feat.6.desc": "OpenAI, Anthropic (Claude), or a local Claude / Codex CLI — no key needed.",
      "feat.7.title": "Generation skills",
      "feat.7.desc": "Ships with a frontend-design skill or loads a custom SKILL.md.",
      "feat.8.title": "Export",
      "feat.8.desc": "Download the whole project as a ZIP.",
      "feat.9.title": "Internationalization",
      "feat.9.desc": "English and Portuguese, auto-detected and switchable.",
      "feat.10.title": "Calm, light UI",
      "feat.10.desc": "A “Canvas + Dock” layout that keeps the preview center stage.",

      "how.kicker": "Three steps",
      "how.title": "From words to working app",
      "how.1.title": "Describe",
      "how.1.desc": "Type the screen you want — attach references if it helps.",
      "how.2.title": "Generate",
      "how.2.desc": "Your AI weaves a full React project, file by file.",
      "how.3.title": "Preview & export",
      "how.3.desc": "See it live, iterate, restore versions, ship a ZIP.",
      "how.mock": "a pricing page with three tiers…",

      "showcase.kicker": "Made from a prompt",
      "showcase.title": "Real screens, one sentence each",
      "showcase.sub": "Every screen below was generated from a single English prompt and rendered live — no hand-written code.",
      "responsive.kicker": "Desktop & mobile",
      "responsive.title": "Preview both formats, instantly",
      "responsive.sub": "Flip between desktop and a phone frame in the preview to check how your generated app responds — no export, no device needed.",
      "showcase.1.label": "Analytics dashboard",
      "showcase.1.prompt": "“A SaaS analytics dashboard with a sidebar, four KPI cards, a revenue line chart, a traffic-sources donut and a recent-activity table. Teal accent.”",
      "showcase.2.label": "SaaS landing page",
      "showcase.2.prompt": "“A modern landing page for a project-management SaaS: sticky nav, a bold hero with a product mockup, a feature grid, pricing tiers and a footer. Indigo accent.”",
      "showcase.3.label": "Account settings",
      "showcase.3.prompt": "“A user settings screen: a sidebar of sections, a profile panel with avatar and edit button, a two-column form, notification toggles and a sticky save footer. Violet accent.”",

      "carousel.prev": "Previous example",
      "carousel.next": "Next example",

      "quickstart.kicker": "Run it locally",
      "quickstart.title": "Up and weaving in a minute",
      "quickstart.sub": "Telar runs on your machine — Node 20+ and npm. Open Settings, pick a provider and paste your key, or select a detected local CLI.",
      "quickstart.note": "🧠 Bring your own AI: OpenAI, Anthropic (Claude), or a local Claude CLI / Codex CLI binary — no API key required.",
      "quickstart.cta": "Read the docs on GitHub",

      "stack.title": "Built with",

      "footer.tagline": "Weave interfaces from a prompt.",
      "footer.repo": "GitHub repository",
      "footer.license": "MIT License",
      "footer.madeWith": "Woven with care · © 2026 Telar"
    },

    pt: {
      "meta.title": "Telar — teça interfaces a partir de um prompt",
      "meta.description": "Um workspace de IA local-first que transforma um prompt em uma interface React de verdade, editável e renderizada ao vivo no navegador. Traga sua própria IA. Nada sai da sua máquina.",

      "nav.features": "Recursos",
      "nav.showcase": "Exemplos",
      "nav.quickstart": "Começar",

      "hero.badge": "✷ Local-first · código aberto",
      "hero.title": "Teça <em>interfaces</em><br />a partir de um prompt.",
      "hero.sub": "Telar é o <b>tear</b> da tecelagem. Descreva uma tela e ele tece o código — um app React de verdade renderizando ao vivo no seu navegador. Local-first, com a sua própria IA.",
      "hero.cta_primary": "Comece no GitHub",
      "hero.cta_secondary": "Veja em ação ↓",
      "hero.note": "Sem conta. Sem backend. Seus projetos ficam no navegador.",
      "hero.frameTitle": "telar · preview ao vivo",
      "hero.promptLabel": "Prompt",
      "hero.promptText": "“A SaaS analytics dashboard with KPI cards, a revenue chart and a traffic donut.”",

      "trust.local": "🔒 Local-first e privado",
      "trust.byoai": "🧠 Traga sua própria IA",
      "trust.oss": "⚖️ Código aberto (MIT)",

      "value.1.title": "Do prompt à UI",
      "value.1.desc": "Descreva uma tela em linguagem natural e receba um projeto React completo e editável — não um screenshot, código de verdade.",
      "value.2.title": "Preview ao vivo no navegador",
      "value.2.desc": "O app gerado roda na hora via WebContainers — um servidor Vite completo, dentro da sua aba.",
      "value.3.title": "Local-first e privado",
      "value.3.desc": "Os projetos ficam no seu navegador (IndexedDB). Você usa sua própria chave de IA ou uma CLI local. Nada é enviado.",

      "features.kicker": "Tudo que você precisa",
      "features.title": "Um workspace, não um brinquedo",
      "feat.1.title": "Do prompt à UI",
      "feat.1.desc": "Descreva uma tela e receba um projeto React completo e editável.",
      "feat.2.title": "Preview ao vivo",
      "feat.2.desc": "Roda no navegador via WebContainers, com um modo mock leve para testes.",
      "feat.3.title": "Projetos",
      "feat.3.desc": "Crie, troque, renomeie e exclua — cada um guarda seu próprio histórico.",
      "feat.4.title": "Versões",
      "feat.4.desc": "Cada geração é um snapshot restaurável.",
      "feat.5.title": "Referências",
      "feat.5.desc": "Anexe arquivos de texto e imagem para guiar a geração.",
      "feat.6.title": "Traga sua própria IA",
      "feat.6.desc": "OpenAI, Anthropic (Claude) ou uma CLI local Claude / Codex — sem API key.",
      "feat.7.title": "Skills de geração",
      "feat.7.desc": "Vem com a skill frontend-design ou carrega um SKILL.md custom.",
      "feat.8.title": "Exportar",
      "feat.8.desc": "Baixe o projeto inteiro como ZIP.",
      "feat.9.title": "Internacionalização",
      "feat.9.desc": "Inglês e português, detectados automaticamente e alternáveis.",
      "feat.10.title": "UI clara e calma",
      "feat.10.desc": "Um layout “Canvas + Dock” que mantém o preview no centro.",

      "how.kicker": "Três passos",
      "how.title": "De palavras a um app funcional",
      "how.1.title": "Descreva",
      "how.1.desc": "Digite a tela que você quer — anexe referências se ajudar.",
      "how.2.title": "Gere",
      "how.2.desc": "Sua IA tece um projeto React completo, arquivo por arquivo.",
      "how.3.title": "Preview e export",
      "how.3.desc": "Veja ao vivo, itere, restaure versões, exporte um ZIP.",
      "how.mock": "uma página de preços com três planos…",

      "showcase.kicker": "Feito a partir de um prompt",
      "showcase.title": "Telas de verdade, uma frase cada",
      "showcase.sub": "Cada tela abaixo foi gerada a partir de um único prompt em inglês e renderizada ao vivo — sem uma linha de código à mão.",
      "responsive.kicker": "Desktop e mobile",
      "responsive.title": "Veja os dois formatos, na hora",
      "responsive.sub": "Alterne entre desktop e uma moldura de celular no preview pra conferir como o app gerado responde — sem exportar, sem precisar de aparelho.",
      "showcase.1.label": "Dashboard de analytics",
      "showcase.1.prompt": "“A SaaS analytics dashboard with a sidebar, four KPI cards, a revenue line chart, a traffic-sources donut and a recent-activity table. Teal accent.”",
      "showcase.2.label": "Landing page de SaaS",
      "showcase.2.prompt": "“A modern landing page for a project-management SaaS: sticky nav, a bold hero with a product mockup, a feature grid, pricing tiers and a footer. Indigo accent.”",
      "showcase.3.label": "Tela de configurações",
      "showcase.3.prompt": "“A user settings screen: a sidebar of sections, a profile panel with avatar and edit button, a two-column form, notification toggles and a sticky save footer. Violet accent.”",

      "carousel.prev": "Exemplo anterior",
      "carousel.next": "Próximo exemplo",

      "quickstart.kicker": "Rode localmente",
      "quickstart.title": "Tecendo em menos de um minuto",
      "quickstart.sub": "O Telar roda na sua máquina — Node 20+ e npm. Abra Configurações, escolha um provedor e cole sua chave, ou selecione uma CLI local detectada.",
      "quickstart.note": "🧠 Traga sua própria IA: OpenAI, Anthropic (Claude) ou um binário local Claude CLI / Codex CLI — sem API key.",
      "quickstart.cta": "Leia a documentação no GitHub",

      "stack.title": "Construído com",

      "footer.tagline": "Teça interfaces a partir de um prompt.",
      "footer.repo": "Repositório no GitHub",
      "footer.license": "Licença MIT",
      "footer.madeWith": "Tecido com carinho · © 2026 Telar"
    }
  };

  // Default is ALWAYS en-US. Portuguese is only used when the visitor
  // explicitly picks it (persisted); we never auto-switch on browser locale.
  function detect() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "pt") return saved;
    } catch (e) {}
    return DEFAULT;
  }

  function apply(locale) {
    var dict = DICT[locale] || DICT[DEFAULT];

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = dict[key];
      if (val == null) return;
      var attr = el.getAttribute("data-i18n-attr");
      if (attr) { el.setAttribute(attr, val); return; }
      if (el.hasAttribute("data-i18n-html")) { el.innerHTML = val; return; }
      el.textContent = val;
    });

    // elements that carry markup
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-html");
      if (dict[key] != null) el.innerHTML = dict[key];
    });

    document.documentElement.lang = locale === "pt" ? "pt-BR" : "en";

    document.querySelectorAll(".lang-switch button").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-lang") === locale);
    });
  }

  function setLocale(locale) {
    try { localStorage.setItem(STORAGE_KEY, locale); } catch (e) {}
    apply(locale);
  }

  function initCarousel() {
    var root = document.querySelector("[data-carousel]");
    if (!root) return;
    var track = root.querySelector(".carousel-track");
    var slides = root.querySelectorAll(".slide");
    var tabs = root.querySelectorAll(".carousel-tabs button");
    var dots = root.querySelectorAll(".carousel-dots button");
    var arrows = root.querySelectorAll(".car-arrow");
    var count = slides.length;
    var index = 0;

    function go(i) {
      index = (i + count) % count;
      track.style.transform = "translateX(-" + index * 100 + "%)";
      tabs.forEach(function (b, n) {
        var on = n === index;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      dots.forEach(function (b, n) { b.classList.toggle("is-active", n === index); });
    }

    tabs.forEach(function (b) {
      b.addEventListener("click", function () { go(parseInt(b.getAttribute("data-slide"), 10)); });
    });
    dots.forEach(function (b) {
      b.addEventListener("click", function () { go(parseInt(b.getAttribute("data-slide"), 10)); });
    });
    arrows.forEach(function (b) {
      b.addEventListener("click", function () { go(index + parseInt(b.getAttribute("data-dir"), 10)); });
    });
    // arrow-key navigation when the carousel has focus within
    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { go(index - 1); }
      else if (e.key === "ArrowRight") { go(index + 1); }
    });

    go(0);
  }

  function init() {
    apply(detect());
    initCarousel();

    document.querySelectorAll(".lang-switch button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setLocale(btn.getAttribute("data-lang"));
      });
    });

    // header shadow on scroll
    var header = document.querySelector(".site-header");
    if (header) {
      var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    // reveal on scroll
    if (!window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var targets = document.querySelectorAll(".section-head, .value-card, .feature, .step, .carousel, .quickstart-inner, .stack-list");
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
          });
        }, { threshold: 0.12 });
        targets.forEach(function (t) { t.classList.add("reveal"); io.observe(t); });
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

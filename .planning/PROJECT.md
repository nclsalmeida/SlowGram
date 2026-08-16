# SlowGram

## What This Is

SlowGram é um "Motor de Desmame Subliminar e Consciência Temporal" (Anti-Addiction Engine): um script JavaScript vanilla, autocontido e de alta performance, injetável em um container WKWebView (iOS) / WebView (Android) que roda a versão web do Instagram. Ele mantém a rolagem 100% nativa e a utilidade social intacta, mas degrada silenciosamente o consumo passivo de Reels ao longo do tempo contínuo de sessão — extinguindo o hábito compulsivo por desinteresse neuroquímico gradual, não por bloqueio abrupto.

A inspiração conceitual vem do `no-scroll` (davidtheclark/no-scroll): um módulo JS mínimo, sem dependências, que resolve uma única coisa bem. Aqui a filosofia é invertida — em vez de tirar o scroll, mantê-lo normal e aplicar um "algoritmo de retenção reverso" que enfraquece o loop viciante de vídeos curtos.

## Core Value

Degradar de forma imperceptível e gradual o consumo de Reels para quebrar o hábito compulsivo, SEM nunca comprometer a utilidade social do Instagram (DMs, perfis, busca) nem frustrar o usuário nos primeiros minutos.

## Requirements

### Validated

- **CORE-01** (Fase 1): Relógio de sessão acumula apenas tempo visível de Reels — validado por 120 asserts Node + 119 Edge real (sem timers, deltas em fronteiras)
- **CORE-02** (Fase 1): PhaseMachine pura `elapsedMs → phase 0..3` com [3,7,12] fixos do CONFIG congelado
- **CORE-03** (Fase 1): Reset de fadiga >5min em background via catch-up wall-clock, gap menor descontado
- **CORE-04** (Fase 1): Motor IIFE vanilla zero dependências com seam de DI validado (nulos = opt-out explícito)
- **CORE-05** (Fase 1): CONFIG congelado único — sem números mágicos fora da factory
- **CORE-06** (Fase 1): Mesmo arquivo do motor roda verde em 2 hosts (Node + WebView/browser)
- **DETC-01** (Fase 2): ContextDetector classifica REELS/SOCIAL/UNKNOWN — pathname autoritativo para rotas preservadas + sinais role/atributo/`<video>` para Reels
- **DETC-02** (Fase 2): RouteGuard preserva `/direct/`, `/messages`, perfis e busca — nunca degradam, re-assert a cada mudança de rota
- **DETC-03** (Fase 2): Contexto UNKNOWN nunca degrada (fail-safe por design)
- **DETC-04** (Fase 2): DomWatcher usa MutationObserver estreito com rAF-batch e filtro de self-mutation (sem loop de feedback)
- **DETC-05** (Fase 2): VideoRegistry mantém estado por vídeo em WeakMap com reset de lifecycle em `loadstart`/`emptied`
- **DETC-06** (Fase 2): Seletores por role/atributo centralizados com health check (N=5 drift → evento + warn dev / fallback prod) — nunca classes CSS
- **DETC-07** (Fase 2): Mocks de DOM do Instagram + `demo.html` para validação determinística
- **DETC-08** (Fase 2): DomWatcher desconecta observers em rotas sociais para reduzir overhead
- **LEVR-01** (Fase 3): Applicator Filter aplica `saturate()` no wrapper ancestral não-transformado (iOS-safe, D-15), idempotente e revertível
- **LEVR-02** (Fase 3): Applicator Playback define `playbackRate` dentro de 0.5–2.0 preservando pitch, reaplicado por vídeo (register + loadstart)
- **LEVR-03** (Fase 3): Applicator Volume usa feature-detect; toca apenas `video.volume`, nunca `video.muted`; só quando `!muted && volume > 0` (Anti-Pattern 2)
- **LEVR-04** (Fase 3): Applicator Autoplay remove o atributo `loop` (nunca `loop="false"`) na fase 3, restaura no revert, e faz pause no `ended` = ponto de parada (gate em `appliedLevers.autoplay`)
- **LEVR-05** (Fase 3): Buffer simulado gateado — `CONFIG.buffer.enabled` default false, stall frame-counted sub-200ms no carrier rAF (sem timers), só no ponto de parada; `revertAll` cancela stalls pendentes
- **LEVR-06** (Fase 3): DegradationEngine hub roteia `phase → matriz de aplicabilidade`; cada applicator é `{key, apply(phase, video), revert(video)}` com reconcile por vídeo
- **LEVR-07** (Fase 3): `revertAll()` restaura todos os vídeos à condição nativa (usado no reset de fadiga)
- **LEVR-08** (Fase 3): Tabelas de clamp por plataforma (WebKit vs Chromium) congeladas em `CONFIG.clampTables` — spec dos limites de cada lever
- **LEVR-09** (Fase 3): Degradação nunca afeta o scroll (100% nativo) e nunca bloqueia de forma abrupta
- **OVER-01** (Fase 4): Overlay de contador de tempo decorrido — neutro, sem culpa, `pointer-events: none`, z-index máximo, atualizado ≤1/s; renderizado em Shadow DOM (validado on-device: pill fixo "N min" no canto inferior esquerdo)
- **OVER-02** (Fase 4): Overlay escondido em rotas sociais (nunca em DMs/perfis/busca) e fullscreen — verificado on-device (/direct/ → overlay off)
- **OVER-03** (Fase 4): Overlay escondido durante fullscreen video (`webkitDisplayingFullscreen`)
- **HARN-01** (Fase 5): Churn sintético 5k mutations/s sem jank — yield-at-cap `maxBatchRecords=200`, drena em exatamente 25 frames
- **HARN-02** (Fase 5): Equivalência wall-clock — contagem e reset, 2 cenários (fluxo normal + WebView sem evento), assert duplo; reset 6min validado on-device (elapsed 280s → 2s)
- **HARN-03** (Fase 5): "Sem degradação em superfícies sociais" primeira classe — matriz cartesiana preservedRoutes × levers + overlay, snapshot pré/pós; validado on-device (/direct/ nativo)
- **HARN-04** (Fase 5): Drift — fixture versionada real-DOM + health N=5 primeira classe + runbook de refresh
- **HARN-05** (Fase 5): Kill-switch — flag mestre desliga em ≤1 frame, disable = revert (feed nativo imediato)
- **HARN-06** (Fase 5): Checklist on-device iOS/Android + device-check.html — executado no Pixel 7 Pro: 6/6 itens passaram; 2 bugs reais encontrados e corrigidos (overlay CSS sem seletor; registro estrelvado no feed real → scan no connect)
- **HARN-07** (Fase 5): Dual-host parity primeira classe — mesmo arquivo do motor em Node e browser puro, zero dependências (Node 930 / Edge 851, delta 79 — re-sync 2026-08-16)

### Active

*(nenhum — milestone v1.0 completo: 5/5 fases, 23/23 planos, UAT on-device passou. Próximo: decisão de deploy v1.1/v2.)*

### Out of Scope

- Wrapper nativo iOS/Android (WKWebView/WebView container) — apenas o motor injetável na v1
- Suporte a TikTok na v1 — só Instagram
- Personalização de tempos pelo usuário — valores fixos na v1 (ajuste manual no código)
- Atraso/inércia artificial de scroll — scroll permanece 100% normal
- Bloqueio abrupto do app — proibido por design
- Automação ativa contra APIs da plataforma — risco de detecção anti-bot
- Mensagens alarmistas ou culpa punitiva no overlay — contador deve ser neutro e elegante

## Context

- **Rede-alvo:** Instagram web (`instagram.com`), rodando dentro de WKWebView (iOS) e WebView (Android).
- **Inspiração:** `no-scroll` (MIT) — bloqueia scroll travando `documentElement` com `position: fixed`, `overflow: hidden`, `width: calc(100% - scrollbarSize)` e restaura a posição no `off()`. SlowGram inverte essa filosofia: nada de bloquear; degradar por desinteresse gradual.
- **Desafio de viabilidade:** Instagram em WebView tem quebras conhecidas (popup de cookies, login via Facebook, detecção de WebView). Mitigação: User-Agent customizado + tratamento de cookies no container. O motor em si não interfere nisso.
- **DOM instável:** O Instagram web é React com classes ofuscadas e mudança constante. Seletores devem ser por papel (`role="dialog"`, `role="main"`), atributos e `<video>`/pathname, monitorados com `MutationObserver`.
- **Tensões comportamentais:** Primeiros 3 minutos devem ser 100% idênticos ao nativo (fase de acolhimento). Degradação só após tempo contínuo de tela. Preservação social é inegociável.

## Constraints

- **Tech stack**: Vanilla JS, IIFE autocontida, zero dependências — injetável no container nativo
- **Compatibilidade**: WKWebView (iOS) e WebView (Android); WebKit/Chromium modernos
- **Segurança**: Zero automação de API da plataforma; nenhuma ação artificial (like, comentário, request)
- **UX**: Overlay com `pointer-events: none` e `z-index: 999999`; não colidir com usabilidade padrão
- **Performance**: Alta performance; observers e filtros CSS sem degradação perceptível no dispositivo
- **Detecção**: Minimizar fingerprint de automação no cliente

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Só o motor JS na v1 (sem wrapper nativo) | Validar o conceito e os seletores de DOM antes de construir o container | Fases 1-2 entregues: motor núcleo + detecção/escopo DOM validados em 2 hosts |
| Só Instagram na v1 | Uma rede para acertar a arquitetura de seletores antes de generalizar (TikTok na v2) | — Pending (v2) |
| Tempos fixos de fase | Simplicidade; parâmetros centralizados no código para ajuste manual | Fase 1: CORE-01/02 entregues — [3,7,12] min fixos e parametrizáveis via CONFIG congelado |
| Scroll 100% normal | Decisão do usuário: degradar só cor/velocidade/áudio/contador/buffer, nunca o scroll | — Pending |
| Seletores por papel/atributo, nunca classes CSS | Classes do Instagram são ofuscadas e mudam; roles/atributos são estáveis | Fase 2 entregue: registry de seletores + health check N=5 (evento, warn dev, fallback prod limitado a /reels/) |
| Degradação como desinteresse gradual, não bloqueio | Filosofia central: acolhimento sem rejeição; quebrar o hábito por neuroquímica, não por punição | — Pending |
| Health check de seletores (N=5, fail-loud dev / fail-soft prod) | Instagram regenera markup ~mensalmente; drift deve ser ruidoso, não silencioso | Fase 2 entregue: `selectorHealth` event + `getSelectorHealth()` + fallbackScope limitado a /reels/ |
| Filtro em wrapper ancestral não-transformado (D-15), nunca no `<video>` | iOS dá ao vídeo acelerado sua própria camada GPU e descarta filtros diretos; o wrapper estático sobrevive | Fase 3 entregue: walk `filterTarget` (skip transformado, limitado a BODY/HTML) + target armazenado com isenção de self-reference |
| Valores de lever só em `CONFIG.leverParams` | CORE-05: sem números mágicos; curva de escalada 0.85→0.65→0.4 é a degradação | Fase 3 entregue: saturador lê só do CONFIG; scan de fonte prova zero literais |
| Clamp tables por plataforma (LEVR-08) | Levers fora de banda no-op silencioso no iOS (rate > 2.0) ou mute de áudio no Chromium (rate > 4.0) | Fase 3 entregue: `CONFIG.clampTables` congelado + `clampForPlatform` em todo lever + seam `env.platform` |
| Volume nunca toca `muted` (Anti-Pattern 2) | Unmute programático pausa playback no iOS; gate `!muted && volume > 0` com feature-detect | Fase 3 entregue: lever de volume + scan de fonte prova zero assignments de `muted` |
| Autoplay remove `loop`, nunca `loop="false"` (D-25) | Atributo presente é o que faz o loop; `loop="false"` é no-op — remoção é o único write reversível | Fase 3 entregue: removeAttribute + origHadLoop + pause no ended (ponto de parada), scan de fonte prova zero loop=false |
| Buffer gateado como capstone standalone (D-26/D-27) | Matriz é T15-locked e o reconcile reverteria um stall matrix-driven; o stall frame-counted vive só no ponto de parada | Fase 3 entregue: `CONFIG.buffer` default off, 2 rAF frames ≈ 33ms, `_setBufferEnabled` test handle |
| Fechamento prova a matriz, não a estende (D-28) | Os critérios da fase são de SISTEMA — composição + lifecycle; o lock novo é o scan do key-set applicators == matriz, com buffer fora | Fase 3 entregue: suíte de fechamento (560 asserts Node / 524 Edge) + scan T-L51a; Phase 3 completa 4/4 |
| Reentrância: destroy desliga listeners de elemento (D-29) | Real DOM deduplica por fn ref; o fake acumula — o unbind no teardown mantém os 2 hosts com um bind por ciclo; nó re-adicionado re-trackea a live list | Fase 3 entregue: teardown unbind + registerVideo re-tracking (T-L47/T-L48) — destroy/re-init nunca duplica listeners |
| Forward automático da página interstitial para /accounts/login/ (D-30) | No primeiro uso, o Instagram logged-out serve uma landing com botão "Abrir Instagram" (hand-off pro app nativo, que o wrapper bloqueia) + link manual "Entrar ou cadastrar-se"; o usuário não deve ter que tapar nada pra chegar ao login. Detecção por MutationObserver (a página renderiza assíncrona após onPageFinished), matching tolerante à quebra do copy entre elementos, guard anti-loop em rotas /accounts/ e /auth/, e fail-soft se a detecção errar | Fase pós-milestone (2026-08-16): host-inject.js + boot, host-inject 18/18, validado no Pixel 7 Pro — primeiro launch cai direto em /accounts/login/ |

## Current Milestone: v1.0 Motor Anti-Vício

**Goal:** Entregar o motor JS vanilla injetável completo com degradação gradual e imperceptível do consumo de Reels, validado por harness de testes baseado em mocks de DOM.

**Target features:** *(all delivered — milestone v1.0 complete)*
- Motor JS vanilla injetável (IIFE, zero dependências), compatível com WKWebView (iOS) e WebView (Android) — entregue
- Timeline de degradação por sessão ativa com 4 fases (nativa, micro-atrito, desgaste sensorial, ponto de parada) — entregue (3/7/12 min)
- Degradação do feed: saturação de cor, playbackRate, volume relativo, bloqueio de autoplay em loop, buffer simulado — entregue (validado on-device)
- Overlay de contador de tempo decorrido (neutro, pointer-events none, z-index alto) — entregue (validado on-device)
- Preservação rígida de rotas sociais (`/direct/`, `/messages`, perfis, busca) — entregue (validado on-device)
- Reset de fadiga via `visibilitychange` (>5 min em segundo plano) — entregue (validado on-device)
- Detecção via `MutationObserver` + seletores por papel/atributo (nunca classes CSS ofuscadas) — entregue
- Zero automação de API da plataforma — entregue
- Tempos de fase fixos e parametrizáveis no código — entregue
- Harness de teste: página demo + mocks de DOM dos seletores do Instagram — entregue

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-16 — milestone v1.0 fechado (5/5 fases, 23/23 planos, UAT on-device passou); auditoria de hardening pós-milestone concluída (P1/P2: engine 930 asserts Node / 851 browser, host-inject 10/10, wrapper JVM 16 debug+release) e documentação re-sincronizada.*
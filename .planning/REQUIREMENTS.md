# Requirements: SlowGram

**Defined:** 2026-08-15
**Core Value:** Degradar de forma imperceptível e gradual o consumo de Reels para quebrar o hábito compulsivo, SEM nunca comprometer a utilidade social do Instagram (DMs, perfis, busca) nem frustrar o usuário nos primeiros minutos.

## v1 Requirements

Requisitos do milestone v1.0 (Motor Anti-Vício). Cada um mapeia para as fases do roadmap.

### Motor Core & Lifecycle (CORE)

- [x] **CORE-01**: Session clock acumula apenas tempo visível de Reels (context==REELS && visible) via deltas `Date.now()` em fronteiras de evento — nunca ticks de timer
- [x] **CORE-02**: PhaseMachine é função pura que mapeia `elapsedMs → phase 0..3` (0–3 / 3–7 / 7–12 / 15+ min) e emite `phasechange` apenas em transições reais
- [x] **CORE-03**: Reset de fadiga reinicia a sessão quando o app fica em background >5 min, computado via delta de wall-clock no catch-up (sinais: `visibilitychange`, `pageshow`, `focus`)
- [x] **CORE-04**: Motor é IIFE vanilla autocontida, zero dependências, com seam de injeção de dependência (`clock`, `MutationObserver`, `document`, `window`) para o harness
- [x] **CORE-05**: CONFIG é objeto congelado único com fases, matriz de degradação por fase, seletores, rotas preservadas e janela de fadiga — sem números mágicos espalhados
- [x] **CORE-06**: Skeleton de fake clock (`advance(ms)`) como keystone do harness determinístico; o mesmo arquivo do motor roda sob mocks e no WebView

### Detecção & Escopo DOM (DETC)

- [x] **DETC-01**: ContextDetector classifica o contexto como REELS/SOCIAL/UNKNOWN, com pathname autoritativo para rotas preservadas e sinais role/atributo/`<video>` para Reels
- [x] **DETC-02**: RouteGuard preserva `/direct/`, `/messages`, perfis e busca — essas rotas nunca degradam; re-assert em cada mudança de rota
- [x] **DETC-03**: Contexto UNKNOWN nunca degrada (fail-safe por design)
- [x] **DETC-04**: DomWatcher usa MutationObserver estreito com rAF-batch e filtro de self-mutation (evita loop de feedback do próprio motor)
- [x] **DETC-05**: VideoRegistry mantém estado por vídeo em WeakMap com reset de lifecycle em `loadstart`/`emptied` (feed virtualizado recicla nodes)
- [x] **DETC-06**: Seletores por role/atributo centralizados em registry de seletores com health check contra drift — nunca classes CSS ofuscadas
- [x] **DETC-07**: Mocks de DOM do Instagram (FakeMutationObserver, FakeVideoElement, fixtures de seletores) + `demo.html` para validação determinística
- [x] **DETC-08**: DomWatcher desconecta observers em rotas sociais para reduzir overhead

### Alavancas de Degradação (LEVR)

- [x] **LEVR-01**: Applicator Filter aplica `saturate()` no wrapper ancestral não-transformado (iOS-safe), idempotente e revertível
- [x] **LEVR-02**: Applicator Playback define `playbackRate` dentro de 0.5–2.0 preservando pitch, reaplicado por vídeo
- [x] **LEVR-03**: Applicator Volume usa feature-detect; toca apenas `video.volume` (Chromium), nunca `video.muted`; só quando `!muted && volume > 0`
- [x] **LEVR-04**: Applicator Autoplay remove o atributo `loop` (não `loop="false"`) via MutationObserver `attributeFilter` e faz pause no `ended` = ponto de parada
- [x] **LEVR-05**: Applicator Buffer simulado é gated atrás de flag, default off, stalls sub-200ms, aplicável apenas no ponto de parada
- [x] **LEVR-06**: DegradationEngine hub roteia `phase → matriz de aplicabilidade`; cada applicator implementa `{key, apply(phase, video), revert(video)}`
- [x] **LEVR-07**: `revertAll()` restaura todos os vídeos à condição nativa (usado no reset de fadiga)
- [x] **LEVR-08**: Tabelas de clamp por plataforma (WebKit vs Chromium) são a spec dos limites de cada lever
- [x] **LEVR-09**: Degradação nunca afeta o scroll (100% nativo) e nunca bloqueia de forma abrupta

### Overlay & Polish (OVER)

- [x] **OVER-01**: Contador de tempo decorrido neutro (sem culpa), em Shadow DOM, `pointer-events: none`, z-index acima dos click catchers do Instagram, atualizado ≤1/s
- [x] **OVER-02**: Overlay fica escondido em rotas sociais
- [x] **OVER-03**: Overlay escondido durante fullscreen de vídeo (`webkitDisplayingFullscreen`)

### Harness & Validação (HARN)

- [x] **HARN-01**: Teste de performance com churn sintético de 5k mutations/s sem jank perceptível (<1% CPU)
- [x] **HARN-02**: Teste de equivalência wall-clock com período oculto (a sessão nunca "mente")
- [x] **HARN-03**: Testes "sem degradação em superfícies sociais" como requisito de primeira classe
- [x] **HARN-04**: Drift tests: refresh de snapshot real-DOM + health checks de seletores
- [x] **HARN-05**: Kill-switch: flag mestre desliga o motor instantaneamente
- [x] **HARN-06**: Checklist de validação on-device iOS/Android (clamps, filter iOS, volume, reset 6min, preservação social)
- [x] **HARN-07**: Suite roda o mesmo arquivo do motor sob mocks, em página browser pura, sem framework — zero dependências de teste

## v2 Requirements

Adiado para release futuro. Rastreado, mas fora do roadmap atual.

### Container Nativo

- **NATV-01**: Wrapper nativo iOS (WKWebView) para injetar o motor
- **NATV-02**: Wrapper nativo Android (WebView) para injetar o motor

### Personalização

- **PERS-01**: Usuário pode configurar os tempos das fases
- **PERS-02**: Usuário pode configurar quais alavancas participam da degradação

### Multi-plataforma e Insights

- **MULT-01**: Suporte a TikTok (segunda rede)
- **MULT-02**: Dashboard de progresso / "tempo economizado"

## Out of Scope

Explicitamente excluído. Documentado para evitar scope creep.

| Feature | Reason |
|---------|--------|
| Wrapper nativo iOS/Android | Milestone v1 é apenas o motor injetável; container é exercício de empacotamento depois que o IIFE estiver provado |
| Suporte a TikTok na v1 | Uma rede para acertar a arquitetura de seletores antes de generalizar |
| Personalização de tempos pelo usuário | Valores fixos na v1; objeto de constantes centralizado é o "settings" da v1 |
| Atraso/inércia artificial de scroll | Scroll permanece 100% normal por decisão do usuário |
| Bloqueio abrupto do app | Proibido por design (reação/abandono); degradação é perceptual, não punitiva |
| Automação ativa contra APIs da plataforma | Risco de detecção anti-bot; fingerprint de automação |
| Mensagens alarmistas ou culpa punitiva | Evidência: framing negativo aumenta ruminação e reatância |
| Buffer simulado como lever primário | Instagram pré-carrega agressivamente — é no-op ou spinner visível; só como capstone gateado no ponto de parada |
| Dashboard de progresso / "tempo economizado" | Revelaria a presença da ferramenta; contradiz o design subliminar |

## Traceability

Preenchido durante a criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Phase 1 | Complete |
| CORE-05 | Phase 1 | Complete |
| CORE-06 | Phase 1 | Complete |
| DETC-01 | Phase 2 | Complete |
| DETC-02 | Phase 2 | Complete |
| DETC-03 | Phase 2 | Complete |
| DETC-04 | Phase 2 | Complete |
| DETC-05 | Phase 2 | Complete |
| DETC-06 | Phase 2 | Complete |
| DETC-07 | Phase 2 | Complete |
| DETC-08 | Phase 2 | Complete |
| LEVR-01 | Phase 3 | Complete |
| LEVR-02 | Phase 3 | Complete |
| LEVR-03 | Phase 3 | Complete |
| LEVR-04 | Phase 3 | Complete |
| LEVR-05 | Phase 3 | Complete |
| LEVR-06 | Phase 3 | Complete |
| LEVR-07 | Phase 3 | Complete |
| LEVR-08 | Phase 3 | Complete |
| LEVR-09 | Phase 3 | Complete |
| OVER-01 | Phase 4 | Complete |
| OVER-02 | Phase 4 | Complete |
| OVER-03 | Phase 4 | Complete |
| HARN-01 | Phase 5 | Complete |
| HARN-02 | Phase 5 | Complete |
| HARN-03 | Phase 5 | Complete |
| HARN-04 | Phase 5 | Complete |
| HARN-05 | Phase 5 | Complete |
| HARN-06 | Phase 5 | Complete |
| HARN-07 | Phase 5 | Complete |

**Coverage:**

- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-15*
*Last updated: 2026-08-15 after roadmap creation*

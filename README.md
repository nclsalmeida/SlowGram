# SlowGram

> Not affiliated with, associated with, authorized by, or sponsored by Meta
> Platforms, Inc. or Instagram. Instagram is a trademark of Meta Platforms, Inc.

## O que é

**SlowGram** é um experimento open-source contra o consumo compulsivo de Reels.
Ele roda o Instagram Web dentro de um WebView e, depois de alguns minutos de
rolagem contínua, degrada o feed de forma **gradual e reversível** — nada de
bloqueio, nenhum julgamento, sem culpa. Você simplesmente começa a perceber,
aos poucos, que aquilo já não prende tanto.

O projeto tem duas partes:

```
SlowGram Engine (src/slowgram.js)          ← JS puro, zero dependências
      ↑  copiado a cada build (nunca editado)
Android WebView Host (android/)            ← Kotlin/Gradle, host mínimo
```

## Como funciona

O engine classifica a rota atual (`/reels/` = superfície de degradação; rotas
sociais como `/direct/`, `/p/`, perfis = sempre 100% nativas) e acumula tempo
real de Reels visível. A degradação escala em fases:

| Fase | Tempo contínuo | Efeitos |
|------|----------------|---------|
| 0 | < 3 min | 100% nativo — acolhimento |
| 1 | 3–7 min | saturação 0.85 (imperceptível) |
| 2 | 7–12 min | saturação 0.65 + velocidade 0.9 |
| 3 | ≥ 12 min | saturação 0.4 + velocidade 0.8 + volume 0.5 |

Tudo reverte instantaneamente fora dos Reels, e o relógio **nunca conta tempo
oculto** (background ≥ 5 min zera a sessão — o engine não te engana).

O engine é validado por uma suíte própria de **930 assertions** no Node
(`test/slowgram.test.js`; **851 no harness de browser** — mesma suíte, zero
dependências), mais o E2E do boot do host (**10/10**) e os testes JVM do
wrapper (**16**, nas variantes debug e release), incluindo verificação em
dispositivo real (ver "Validação em dispositivo").

## Android

Esta primeira versão é um **host WebView**: o app abre `instagram.com` (versão
web/mobile — não o aplicativo nativo) e injeta o engine após cada
carregamento de página. A navegação SPA interna do Instagram é detectada pelo
próprio engine (RouteGuard) — o app nunca reinjeta em mudanças de rota.

Política de navegação (conservadora):

- `instagram.com` e subdomínios → permanecem no WebView (login, consentimento
  e rotas SPA intactos);
- links externos (`http`/`https` de outros hosts) → abertos no navegador do
  sistema, nunca dentro do app;- qualquer esquema não-http (`instagram://`, `intent://`, `tel:`, …) →
   **bloqueado** — o app nunca delega para o aplicativo nativo do Instagram.

**Ajustes cosméticos (host, não engine)** — regras CSS injetadas pelo
wrapper em `android/app/src/main/assets/host-inject.js`, verificadas em
aparelho (Pixel 7 Pro, 2026-08), todas best-effort (se o Instagram mudar os
seletores, o comportamento original volta sem quebrar nada):
- esconde o banner "Usar o app" (seletor `div._acc8._abpk`);
- força o wordmark do Instagram a renderizar branco
  (`i[aria-label="Instagram"]` + `filter: brightness(0) invert(1)`) — o
  sprite preto fica quase invisível na tela de login escura;
- nos Reels, mantém a legenda inteira acima da bottom nav
  (`div[class*="xpqajaz"][class*="xtijo5x"]` + `padding-bottom`) — o item
  de cada reel tem exatamente a altura do viewport e a nav fixa (73px)
  cobria as últimas linhas da legenda ("… mais", "Áudio original") e
  roubava o toque do "mais" (a aba Reels da nav ficava por cima). Com o
  padding, o bloco da legenda sobe e o toque em qualquer parte dela
  expande o texto normalmente.

**Configurações e privacidade:** a tela (privacidade + sobre + GitHub +
aviso não-afiliado) é acessada por **atalho do launcher** — pressione e
segure o ícone do SlowGram → "Configurações e privacidade". Não há nenhum
botão flutuante sobre o Instagram.

**Botão voltar do sistema:** navega o histórico do app em vez de fechá-lo.
Como o Instagram usa rotas SPA (pushState), invisíveis para
`canGoBack()` do WebView, o wrapper registra um `OnBackInvokedCallback`
(API 33+, com fallback para `onBackPressed()` em APIs antigas) que:
1. usa o histórico nativo do WebView quando existe; senão
2. pede à própria página (`history.back()`) quando há rota anterior real
   **e** a rota atual difere da rota de entrada (sem armadilha — da home,
   voltar fecha o app normalmente).
Validado no Pixel 7 Pro: voltar de uma DM retorna ao feed, voltar do feed
fecha o app.

## Instalação

1. Baixe o APK mais recente da página de **Releases** do repositório
   (`SlowGram-vX.Y.Z.apk`) — ou do artefato do workflow *android-release*.
2. Toque no arquivo para instalar.

> ⚠️ **APKs não assinados não instalam em Android 14+.** O build de release
> atual produz um APK **não assinado** (MVP), que o Android rejeita com
> `INSTALL_PARSE_FAILED_NO_CERTIFICATES`. Para instalar hoje, use um APK
> assinado — ex.: o `assembleDebug` (assinado com a chave de debug) ou o
> `slowgram-vX.Y.Z-debug-signed.apk` gerado por apksigner com a chave de
> debug. A assinatura de produção via GitHub Secrets está no roteiro (ver
> "Assinatura (futuro)").
3. Se o Android pedir permissão, habilite **"Instalar aplicativos
   desconhecidos"** para a fonte que você usou (navegador/arquivos):
   *Ajustes → Apps → (fonte) → Permitir instalação de apps desconhecidos*.
   Isso é necessário porque o APK não é distribuído pela Play Store.
4. Abra o SlowGram e faça login no Instagram. Pronto.

> **Nota:** o Android pode exibir um aviso do Play Protect ("app
> desconhecido") em APKs sideload. É esperado — o projeto é de código aberto,
> auditável, e sem qualquer SDK de terceiros.

## Compilação

Pré-requisitos: **JDK 17** (não mais — o Gradle 8.13 embutido no wrapper não
parseia JDKs mais novos, ex. Java 25: `IllegalArgumentException: 25.0.2`) e
Android SDK (platform 36, build-tools 35+; o caminho local fica em
`android/local.properties`, que é gitignored — cada máquina aponta para o
seu próprio SDK).

```text
git clone <repo-url>
cd SlowGram/android
JAVA_HOME=<caminho-do-jdk-17> ./gradlew test          # testes do wrapper (JVM/Robolectric)
JAVA_HOME=<caminho-do-jdk-17> ./gradlew assembleDebug # APK de debug
JAVA_HOME=<caminho-do-jdk-17> ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release-unsigned.apk
```

O engine (`src/slowgram.js`) é copiado para os assets em cada build — o
wrapper **nunca** modifica o engine.

### Desenvolvimento / preview

O projeto é JS puro sem `package.json` — para ver o engine no navegador sem
compilar nada:

```bash
node .freebuff/serve.js   # serve a raiz em http://127.0.0.1:8080
```

- `http://127.0.0.1:8080/demo.html` — demo da detecção de rota;
- `http://127.0.0.1:8080/test/harness.html` — a suíte completa do engine
  rodando em browser puro (sem servidor/npm), a mesma do Node;
- porta padrão 8080, sobrescreva com `PORT=9090 node .freebuff/serve.js`.

`.freebuff/` (servidor de preview, scripts de depuração CDP, screenshots e
logs de sessão) é material de desenvolvimento e **não é versionado**.

### Assinatura (futuro)

O MVP gera APK **não assinado**. A arquitetura está pronta para assinatura
via GitHub Secrets: adicione `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS` e `KEY_PASSWORD` ao repositório e um `keystore.properties`
local (no `.gitignore`) apontando para o keystore. Nenhuma keystore ou senha
entra no repositório.

## Privacidade

- **Sem analytics, sem Firebase, sem trackers, sem SDKs de terceiros.**
  O app não tem uma única dependência de runtime além do framework Android.
- **Sem servidor obrigatório** — tudo roda localmente no aparelho.
- **Sem coleta deliberada de dados pessoais.** O bridge de status do engine
  (existe **apenas em builds de debug** — release não expõe nenhuma interface
  JS) escreve só no Logcat (via `adb logcat`) para fins de validação; nada
  deixa o aparelho.
- A sessão do Instagram fica nos cookies locais do app (privados por app,
  `allowBackup=false`).
- Permissão única: `android.permission.INTERNET`.

## Compatibilidade

| Item | Valor | Status |
|------|-------|--------|
| minSdk | 24 (Android 7.0) | suportado pelo código |
| target/compileSdk | 36 (Android 16) | alvo do build |
| Recomendado | Android 15/16 | era do dispositivo de teste |
| Android System WebView | atualizado (Play Store) | exigido pelo app |
| Testado em | Pixel 7 Pro — Android Chrome (UAT Fase 5) e Android WebView (wrapper) | validado (ver abaixo) |

## Validação em dispositivo real (Pixel 7 Pro, 2026-08)

Níveis de validação usados neste projeto (nunca confundir um com o outro):

| Nível | O que prova | Status |
|-------|-------------|--------|
| **Testes automatizados** | o engine roda verde sob mocks (Node 930 / browser 851) + boot do host (10) + wrapper JVM (16, debug e release) | ✅ executado nesta auditoria |
| **Browser/harness** | `test/harness.html` em browser puro (sem servidor/npm) — Edge headless **851/851** | ✅ executado |
| **Chrome Android** | motor REAL injetado em instagram.com no Android Chrome (UAT Fase 5): clamps exibidos, saturação em 13 wrappers, volume 0.5 em 6 vídeos (confirmação audível), reset 6 min (280s → 2s), `/direct/` 100% nativo, pill "3 min" | ✅ executado (05-UAT) |
| **Android WebView** | wrapper completo no WebView do Pixel: login real, feed/Reels renderizando, degradação 3/7/12 min observada pelo usuário, shims (banner/wordmark/legenda), botão voltar e posição do pill — verificados via DOM/CDP + pixels + confirmação visual | ✅ executado (manual/observacional, pós-milestone) |
| **Dispositivo físico** | qualquer item acima rodado num aparelho real | ✅ Pixel 7 Pro |

**Validações AINDA NÃO realizadas (honesto — nada abaixo foi executado):**

- Checklist sistemático dos 6 itens **dentro do WebView** — a UAT da Fase 5
  rodou em **Android Chrome**; a validação WebView foi manual/observacional,
  não um run formal do checklist.
- **Kill switch** exercitado em aparelho (só harness).
- Lever de **buffer** em aparelho (off por default).
- **iOS** — os clamps WebKit são spec, não validação em superfície real.
- **CPU < 1%** do observer: estimativa estrutural (yield-at-cap 200/frame,
  síntese 5k mutações/s no harness), **não medida** em aparelho.
- **Release signing** — o APK release atual é não assinado (ver "Assinatura").

## Testes — níveis (importante)

O wrapper diferencia explicitamente o que cada nível prova. **O APK não é
"funcional" só porque o build e os testes JVM passam.**

1. **Testes automatizados** — 930 asserts do engine (Node; 851 no harness de
   browser) + E2E do boot do host (`test/host-inject.test.js`, Node, 10/10) +
   testes JVM do wrapper (16, nas variantes debug e release: política de
   navegação, guard de injeção, integridade do asset, criação/estado do
   WebView via Robolectric, gate do bridge por debug).
2. **Build** — `assembleRelease` gera o APK (CI e local).
3. **Teste no WebView** — instalar no aparelho e confirmar que o WebView abre
   o Instagram e renderiza.
4. **Teste real do Instagram** — login, rolagem, navegação SPA, rotas sociais.
5. **Teste de degradação real** — 3/7/12 min em Reels: saturação, velocidade,
   volume, pill, reset de 5 min em background, preservação em `/direct/`.

Checklist de dispositivo (status real, 2026-08):

```text
[x] WebView abre instagram.com e renderiza (nível 3) — Pixel 7 Pro
[x] Login funciona dentro do WebView (nível 4) — Pixel 7 Pro
[x] /reels/ degrada em 3 min (saturação 0.85) (nível 5) — WebView (observacional)
[x] /direct/ 100% nativo, sem overlay (nível 5) — WebView
[ ] Background 6+ min zera o relógio — validado em Chrome Android (280s→2s);
    pendente de re-teste sistemático no WebView
[ ] Kill switch em aparelho (só harness)
[ ] Buffer lever em aparelho (off por default)
[ ] iOS (qualquer superfície)
```

Se o Instagram não entregar a versão web correta com o UA padrão do WebView,
o próximo passo documentado é um UA customizado equivalente ao Chrome Mobile
— só com evidência real.

## Aviso

SlowGram não é afiliado, associado, autorizado ou patrocinado pela Meta
Platforms, Inc. ou Instagram. O uso do Instagram está sujeito aos termos de
serviço da Meta. O SlowGram é um experimento pessoal de bem-estar digital;
use por sua conta e risco.

## Licença

[MIT](LICENSE) — use, modifique e redistribua livremente, inclusive em
projetos proprietários, mantendo o aviso de copyright.

## Roteiro futuro (não implementado)

A arquitetura do engine é isolada do host; futuramente o SlowGram Core poderá
ser reutilizado para outros pares (iOS + Instagram, Android/TikTok, …). Os
seletores e regras específicas do Instagram poderão ser extraídos para um
*adapter* — apenas uma sugestão, nada implementado.

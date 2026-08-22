# SlowGram

> Not affiliated with, associated with, authorized by, or sponsored by Meta
> Platforms, Inc. or Instagram. Instagram is a trademark of Meta Platforms, Inc.

> **Estado atual:** release **v1.1.1** publicada (tag `v1.1.1`). O master
> segue à frente dela como `1.1.2-dev` (versionCode 4): cura da observação
> dos reels (âncora `role=dialog` + re-init do observador), espelho de
> degradação guiado por fase, levantamento cirúrgico da legenda de reels
> (**em validação on-device**) e catálogo de diagnóstico em Logcat. A
> alavanca de teste `SG_FAST_REELS` está **ATIVA** neste estado — ver
> "Alavanca de teste" abaixo.

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

**Entrega em duas vias (v1.1.2-dev):** as alavancas oficiais do engine
aplicam-se aos vídeos REGISTRADOS pelo observador dele — e o markup atual de
`instagram.com/reels` dificulta isso (sem `[role=main]`, vídeos fora das
raízes observadas; diagnosticado por sonda: `registry=1` vs `videos=13`).
O host hoje (a) planta `role="dialog"` no contêiner dos itens e re-executa
`init()` uma vez para o observador enxergar as duas raízes, e (b) mantém um
**espelho** guiado por `getState().phase` que aplica os MESMOS valores de
`getConfig()` direto nos vídeos montados. Motor continua autoritativo —
valores idênticos tornam as escritas idempotentes.

O engine é validado por uma suíte própria de **930 assertions** no Node
(`test/slowgram.test.js`; **851 no harness de browser** — mesma suíte, zero
dependências), mais o E2E do boot do host (**18/18**) e os testes JVM do
wrapper (**33**, nas variantes debug e release), incluindo verificação em
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

**Uploads de mídia, câmera e microfone (v1.1)** — o host implementa o ciclo
completo de mídia do Instagram Web:

- `onShowFileChooser` abre o seletor do sistema (`ACTION_GET_CONTENT`)
  aceitando `image/*` **e** `video/*` — anexos de DM, posts de feed e
  stories; múltipla seleção suportada onde a página pede;
- **captura nativa** de foto/vídeo aparece como fonte extra dentro do mesmo
  seletor (linha superior do chooser), gated pela permissão `CAMERA`;
  a foto sai via FileProvider em cache privado, apagada após o uso;
- **WebRTC** (`getUserMedia` — câmera/mic da página, ex. Stories) passa por
  `onPermissionRequest`, que concede SOMENTE recursos mapeados
  (câmera/microfone) e somente com a permissão Android correspondente já
  concedida — recurso desconhecido nunca é concedido;
- **permissões pedidas na hora do uso, nunca antes**: `CAMERA`,
  `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO` (API 33+) ou
  `READ_EXTERNAL_STORAGE` (maxSdk 32). Recusar não quebra nada: o seletor
  SAF é permission-free — negar só esconde as fontes de captura até conceder;
- **cancelamento seguro**: fechar o seletor sem escolher resolve o callback
  com `null` — um callback pendente jamais trava uploads futuros.

**User-Agent (v1.1)** — o wrapper deriva da UA REAL do WebView a forma exata
Chrome-on-Android (remove os marcadores `; wv` e `Version/N.N`). Nada de
string congelada: os números de versão acompanham o WebView instalado do
aparelho; o fallback fixo só entra se a UA do sistema não for Chromium
(política pura em `UserAgent.kt`, testada por JVM).

**Pull-to-refresh (v1.1.1)** — puxe para baixo no topo para recarregar,
igual ao navegador mobile (o app web do Instagram não tem controle de
refresh próprio — sem isso, ver seus próprios stories recém-postados
exigia fechar e reabrir o app). Desabilitado em `/reels*`: um swipe para
baixo no primeiro reel nunca recarrega a página no meio da sessão.

### Limitações conhecidas do Instagram Web (NÃO são bugs do wrapper)

Verificado on-device (Pixel 7 Pro, Android 17) reproduzindo o MESMO fluxo
no Chrome mobile em instagram.com — falha idêntica fora do SlowGram:

- **Story: texto não arrasta** — o listener de touch do composer chama
  `preventDefault()` dentro de listener passivo (o console inunda de
  avisos); o texto é digitado mas não reposiciona;
- **Story: "Carregando..." infinito após postar** — o story É publicado
  (a notificação do sistema confirma), mas a tela nunca sai do
  carregando; fechar e reabrir resolve (ou puxe para atualizar);
- **Sem Close Friends no composer de Stories** — o controle nem renderiza
  na árvore de acessibilidade da web; é um recurso que a Meta não expõe
  na versão web.

Corrigir esses itens exigiria remendar a página do Instagram por fora,
o que viola os princípios do projeto. Reporte à Meta 😉

### Alavanca de teste — ATIVA neste estado (desligar antes de release!)

`SG_FAST_REELS = true` no boot (`host-inject.js`) arma DUAS coisas:

1. **Relógio 60×** via o seam público `SlowGram.init({clock})`: os limites
   de fase `[3,7,12] min` elapsam em `[3,7,12] s` de reels assistido —
   degradação máxima em menos de um minuto;
2. **Espelho de degradação** no host: aplica os valores da fase direto nos
   vídeos montados (ver "Entrega em duas vias" acima).

Desligar: `SG_FAST_REELS = false` no arquivo ou
`localStorage.sgFastReels='0'` no aparelho.

> ⚠️ **OBRIGATÓRIO voltar para `false` antes de qualquer tag de release** —
> a timeline de pesquisa ([3,7,12] min) é contrato do projeto (RESEARCH.md
> FA-03/FA-07). Com a alavanca ativa, pausas >5s fora dos reels também zera
> a sessão (janela de fadiga comprimida junto).

**Proteções de Stories (v1.1.1+)** — como o composer não dá nenhum feedback
após postar (bug upstream acima), o wrapper mantém uma cadeia de
salvaguardas *fail-soft*, baseadas no rótulo dos botões (PT/EN/ES — se a
Meta mudar os textos, o comportamento original volta):

- **Anti-duplicado**: toque em "Adicionar ao seu story" capturado na fase de
  captura; os seguintes, por 20s, são ignorados (mata duplo-toque e spam de
  impaciência durante a janela morta de upload);
- **Auto-retorno à home na CONFIRMAÇÃO**: detectado o anúncio de sucesso da
  página ("Seu story foi adicionado ao Instagram" — região `aria-live`),
  pula para uma home FRESCA incondicionalmente, sem diálogo de navegação
  (o guard `beforeunload` do composer é silenciado só nos pulos do wrapper);
- **Fallbacks do auto-retorno**: fechamento do composer (com guarda de
  superfície / e /stories*) ou ~60s de compositor travado → desiste sem
  atrapalhar; nunca interrompe upload em andamento;
- **Exclusão → home fresca**: clique em "Excluir/Descartar/Delete" dentro
  de `/stories*` recarrega a home em ~3s — cura o anel fantasma da bandeja
  E o estado podre do composer que fazia o próximo post falhar;
- **Falha de post → home fresca**: anúncios de erro redefinem o estado;
- **Auto-recuperação de crash**: se o JS do Instagram morrer na tela
  "Ocorreu um erro", o boot detecta (varredura de nós de texto, dois
  marcadores exigidos) e recarrega sozinho — máx. 2 recargas/minuto
  (sessionStorage); passou disso, o botão manual deles permanece.

**Ajustes cosméticos (host, não engine)** — regras CSS injetadas pelo
wrapper em `android/app/src/main/assets/host-inject.js`, verificadas em
aparelho (Pixel 7 Pro, 2026-08), todas best-effort (se o Instagram mudar os
seletores, o comportamento original volta sem quebrar nada):
- esconde o banner "Usar o app" (seletor `div._acc8._abpk`);
- força o wordmark do Instagram a renderizar branco
  (`i[aria-label="Instagram"]` + `filter: brightness(0) invert(1)`) — o
  sprite preto fica quase invisível na tela de login escura;
- nos Reels, mantém a legenda inteira acima da bottom nav. **Estado
  v1.1.2-dev: EM DEPURAÇÃO** — a Meta rotacionou os nomes de classe
  ofuscados que o seletor CSS original usava (`xpqajaz`+`xtijo5x`), e o
  markup novo tirou `[role=main]` e moveu a legenda para uma camada
  flutuante fora do item. O mecanismo atual tem três camadas: (1) o CSS
  antigo permanece (inofensivo quando os nomes voltam); (2) fallback
  geométrico classe-independente — a cada novo `<video>`, sobe pelos
  ancestrais até o item snap cuja altura fica na faixa 72–98% do viewport
  (o item de ~826px da era do fix original) e aplica `padding-bottom:
  93px !important` inline, reafirmado a cada tique; (3) levantamento
  cirúrgico da CAMADA da legenda: localizada pelo próprio texto ("Áudio
  original" / "Vídeos do Reels de"), sobe ao ancestral comum mais profundo
  dos marcadores e aplica `bottom: 93px` ou `translateY(-93px)`
  conforme a ancoragem. **Última rodada on-device ainda não confirmou o
  resultado visual** — próximos passos: ler a geometria logada
  (`caption block ... h/bottom/pos`) e calibrar o alvo.

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

## Diagnóstico em Logcat (tag `SlowGram`)

Tudo que o wrapper faz de interessante aparece na tag `SlowGram` (D),
inclusive em builds release. Filtrar:

```powershell
adb logcat | Select-String "SlowGram:"   # ou: adb logcat -s SlowGram
```

| Linha | Significado |
|---|---|
| `[nav] decide/onPageFinished url=...` | cada navegação real e a URL final |
| `[upload] file chooser requested mode=N` | seletor de mídia aberto pela página |
| `[refresh] pull-to-refresh -> reload` | gesto de puxar-para-atualizar |
| `story post detected` | 1º toque em "Adicionar ao seu story" |
| `story post debounced (cooldown)` | toque extra ignorado (janela de 20s) |
| `live region: <texto>` | anúncio da página capturado (confirmação/exclusão/erro) |
| `story CONFIRMED (path=...) -> fresh home` | post confirmado → pulo pra home |
| `story lifecycle (deleted/failed) -> fresh home` | exclusão ou falha → home fresca |
| `jumping -> fresh home` | navegação automática executada |
| `upstream error page -> auto-reload (n/2)` | tela "Ocorreu um erro" recuperada sozinha |
| `reels probe: <classes>` | cadeia de classes atuais ao redor do vídeo (1×/página) |
| `reels lift on <tag class h>` | item snap que recebeu o padding da legenda |
| `caption block ... h/bottom/pos` | geometria do bloco da legenda encontrado |
| `caption lifted via bottom/translate` | camada da legenda erguida (e como) |
| `mirror: phase N -> sat/rate/vol` | espelho aplicando alavancas da fase N |
| `engine: ctx= run= phase= elapsed= registry= videos=` | estado interno do engine + contadores de registro/filtro |

Estas linhas foram a base de TODA a depuração on-device desta sessão
(registry vs videos revelou o observador sem raiz; o live region revelou o
texto exato "Seu story foi adicionado ao Instagram").

## Instalação

1. Baixe o APK mais recente da página de **Releases** do repositório
   (`SlowGram-vX.Y.Z.apk`) — ou do artefato do workflow *android-release*.
2. Toque no arquivo para instalar.

> ✅ **O release é assinado** (v2) e instala em Android 14+ sem flags extras.
> A assinatura é obrigatória por design — `assembleRelease` falha sem
> `keystore.properties` (ver "Assinatura").
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
Android SDK (platform 36, build-tools 35+).

O caminho do SDK é config de máquina (gitignored) — um clone novo não vem
com `android/local.properties`. Escolha **uma** das duas opções:

- **opção 1:** criar `android/local.properties` com `sdk.dir=<caminho-do-sdk>`
  (ex. `sdk.dir=C\:\\Users\\seu-usuario\\AppData\\Local\\Android\\Sdk`);
- **opção 2:** exportar `ANDROID_HOME=<caminho-do-sdk>` no ambiente **antes**
  de rodar o gradlew (é o que a CI faz; sem isso o build falha com
  `SDK location not found`).

```text
git clone <repo-url>
cd SlowGram/android
JAVA_HOME=<caminho-do-jdk-17> ./gradlew test          # testes do wrapper (JVM/Robolectric)
JAVA_HOME=<caminho-do-jdk-17> ./gradlew assembleDebug # APK de debug
JAVA_HOME=<caminho-do-jdk-17> ./gradlew assembleRelease
# APK assinado: android/app/build/outputs/apk/release/app-release.apk
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

### Assinatura

O build de release agora é **obrigatoriamente assinado** (desde a
implementação do item "Assinatura de Release"): o `assembleRelease` **falha**
se `android/keystore.properties` não existir — não é um bug, é um guard
proposital (`validateReleaseSigning` no `build.gradle.kts`) para nunca gerar
um APK release silenciosamente unsigned. O `assembleDebug` não é afetado
(usa a chave de debug do SDK).

**Gerar a keystore de release (uma única vez, local):**

```bash
keytool -genkeypair -v -alias slowgram-release -keyalg RSA -keysize 2048 \
  -sigalg SHA256withRSA -validity 9125 -storetype PKCS12 \
  -keystore <caminho>/slowgram-release.jks
```

- `-validity 9125` = **25 anos** (padrão Play Store; evita regerar).
- **Guarde a keystore + senha em um cofre/backup separado da máquina** —
  perdê-la significa que qualquer versão futura do app é um app diferente
  aos olhos do Android/Play Store (impossível atualizar por cima).
- A keystore nunca é commitada (`*.jks`/`*.keystore` no `.gitignore`).

**Builds assinados na máquina de dev:** crie `android/keystore.properties`
(no `.gitignore`) com:

```properties
storeFile=<caminho-absoluto-ou-relativo-ao-modulo-app-da-keystore>
storePassword=<senha-da-keystore>
keyAlias=slowgram-release
keyPassword=<senha-da-key>
```

**CI (GitHub Actions)** — o workflow `android-release` reconstrói a
assinatura a partir de **4 secrets** do repositório (nenhum valor entra no
código — só `${{ secrets.* }}`):

| Secret | O que é |
|---|---|
| `KEYSTORE_BASE64` | a keystore em base64 — ex.: `base64 -w0 slowgram-release.jks` |
| `KEYSTORE_PASSWORD` | senha da keystore |
| `KEY_ALIAS` | `slowgram-release` |
| `KEY_PASSWORD` | senha da key |

O workflow decodifica a keystore para `app/release.jks`, reconstrói o
`keystore.properties` no runner, builda `assembleRelease` e **verifica a
assinatura com `apksigner` antes de publicar** (falha se o APK não estiver
assinado). Se qualquer secret estiver ausente, o passo de reconstrução
falha com `::error::` — o release nunca publica APK sem assinatura.

## Identidade visual (ícone do app)

O ícone nasce de UMA imagem quadrada e vira todos os assets do launcher:

1. Coloque seu logo em **`design/logo-source.png`** — PNG quadrado
   (idealmente 1024×1024), fundo opaco: ele preenche o ícone inteiro;
2. Rode `pwsh tools/generate-icons.ps1`;
3. Rebuild o app (`gradlew assembleDebug` / CI).

O script gera, para mdpi…xxxhdpi:

- `ic_launcher.png` — ícone legado (48→192 px, cantos arredondados);
- `ic_launcher_round.png` — variante circular;
- `ic_launcher_foreground.png` — camada adaptativa no canvas 108dp com a
  arte dentro da safe-zone central (66/108);

mais o fundo adaptativo pela cor da marca (`values/colors.xml`). Os XMLs
adaptativos (`mipmap-anydpi-v26/`) já apontam para esses assets — nada mais
para editar. Sem arquivo-fonte, o script desenha automaticamente a
identidade padrão do projeto (ampulheta sobre o fundo escuro) — é o que vem
gerado neste repositório. A camada `monochrome` (ícones temáticos
Android 13+) fica desligada de propósito: um glifo alfa-only não pode ser
derivado de uma foto arbitrária.

## Privacidade

- **Sem analytics, sem Firebase, sem trackers, sem SDKs de terceiros.**
  A única dependência de runtime além do framework Android é `androidx.activity`
  (necessária ao seletor de uploads via ActivityResult API).
- **Sem servidor obrigatório** — tudo roda localmente no aparelho.
- **Sem coleta deliberada de dados pessoais.** O bridge de status do engine
  (existe **apenas em builds de debug** — release não expõe nenhuma interface
  JS) escreve só no Logcat (via `adb logcat`) para fins de validação; nada
  deixa o aparelho.
- A sessão do Instagram fica nos cookies locais do app (privados por app,
  `allowBackup=false`).
- **Permissões mínimas, pedidas na hora do uso:** `INTERNET` sempre;
  `CAMERA`, `RECORD_AUDIO` e `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO`
  (API 33+; `READ_EXTERNAL_STORAGE` até a API 32) apenas quando você anexa
  ou captura mídia. O seletor de arquivos do sistema em si nem precisa de
  permissão de storage. Nada de localização, contatos, notificações,
  overlay ou acessibilidade.

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
| **Testes automatizados** | o engine roda verde sob mocks (Node 930 / browser 851) + boot do host (18) + wrapper JVM (31, debug e release) | ✅ executado nesta auditoria |
| **Browser/harness** | `test/harness.html` em browser puro (sem servidor/npm) — Edge headless **851/851** | ✅ executado |
| **Chrome Android** | motor REAL injetado em instagram.com no Android Chrome (UAT Fase 5): clamps exibidos, saturação em 13 wrappers, volume 0.5 em 6 vídeos (confirmação audível), reset 6 min (280s → 2s), `/direct/` 100% nativo, pill "3 min" | ✅ executado (05-UAT) |
| **Android WebView** | wrapper completo no WebView do Pixel, **checklist formal de 6 itens executado (2026-08-16)**: login real, home renderizada, /reels/ degradando aos 3 min (pill "3 min" visível), /direct/ 100% nativo (timestamp "4 min" confirmado como nativo por posição no DOM), background 6+ min zera o relógio (sem pill ao voltar, sem crash), sessão mantida após background (perfil logado) — além dos shims e do forward de primeiro uso (D-30) | ✅ executado (checklist completo, ver abaixo) |
| **Dispositivo físico** | qualquer item acima rodado num aparelho real | ✅ Pixel 7 Pro |

**Validações AINDA NÃO realizadas (honesto — nada abaixo foi executado):**

- **Kill switch** exercitado em aparelho (só harness).
- Lever de **buffer** em aparelho (off por default).
- **iOS** — os clamps WebKit são spec, não validação em superfície real.
- **CPU < 1%** do observer: estimativa estrutural (yield-at-cap 200/frame,
  síntese 5k mutações/s no harness), **não medida** em aparelho.
- **Legenda dos reels orgânicos** — lift cirúrgico implementado
  (`e01540f`+`6887108`), resultado visual AINDA NÃO confirmado pelo
  mantenedor (sessão encerrada na validação).
- **Smoke TH4** (harness no Edge headless): env-gated — nesta sessão o
  `msedge.exe` do host está inerte (não emite dump nem para um
  `data:text/html`), então o item exige uma sessão com browser funcional.
  Não é regressão do engine (927/928 asserts passam; o 1 falho é o TH4).

### Sessão de validação v1.1.2-dev (Pixel 7 Pro via adb, 2026-08)

Itens CONFIRMADOS on-device pelo mantenedor nesta rodada:

- ✅ Postagem de story sem duplicatas (anti-duplicado de 20s);
- ✅ Auto-retorno à home fresca após a confirmação do post (~10s pós-toque);
- ✅ Anti-travamento: observador de interstício throttled/desarmado (CPU
  normalizada);
- ✅ Pull-to-refresh funcional e isento em /reels*;
- ✅ Exclusão de stories → home fresca automática; postar após excluir sem
  erro;
- ✅ Auto-recuperação da tela "Ocorreu um erro" do Instagram;
- ✅ Degradação de reels visível end-to-end no modo acelerado (espelho +
  motor: registry 13-14 vídeos, todos filtrados, fases 0→3);
- ⏳ Legenda dos reels orgânicos — mecanismo implementado, confirmação
  visual pendente (ver "Ajustes cosméticos").

## Testes — níveis (importante)

O wrapper diferencia explicitamente o que cada nível prova. **O APK não é
"funcional" só porque o build e os testes JVM passam.**

1. **Testes automatizados** — 930 asserts do engine (Node; 851 no harness de
   browser) + E2E do boot do host (`test/host-inject.test.js`, Node, 18/18) +
   testes JVM do wrapper (33, nas variantes debug e release: política de
   navegação, guard de injeção, integridade do asset, criação/estado do
   WebView via Robolectric, gate do bridge por debug, política de User-Agent,
   mapeamento de permissões WebRTC/storage e contrato de mime-types do
   seletor de uploads).
2. **Build** — `assembleRelease` gera o APK (CI e local).
3. **Teste no WebView** — instalar no aparelho e confirmar que o WebView abre
   o Instagram e renderiza.
4. **Teste real do Instagram** — login, rolagem, navegação SPA, rotas sociais.
5. **Teste de degradação real** — 3/7/12 min em Reels: saturação, velocidade,
   volume, pill, reset de 5 min em background, preservação em `/direct/`.

Checklist de dispositivo (status real, 2026-08):

```text
[x] WebView abre instagram.com e renderiza (nível 3) — Pixel 7 Pro, 2026-08-16
[x] Login funciona dentro do WebView (nível 4) — Pixel 7 Pro, login manual
[x] /reels/ degrada em 3 min (saturação 0.85) (nível 5) — pill "3 min" visível
[x] /direct/ 100% nativo, sem overlay (nível 5) — DM limpa; "4 min" é timestamp
    nativo (posição no DOM ≠ pill do SlowGram)
[x] Background 6+ min zera o relógio (nível 5) — sem crash; sem pill ao voltar
    (contador zerado, re-acumula só com Reels novos)
[x] Voltar do background mantém a sessão (nível 4) — perfil logado após 6+ min
[ ] Kill switch em aparelho (só harness)
[ ] Buffer lever em aparelho (off por default)
[ ] iOS (qualquer superfície)
[ ] Uploads de mídia em aparelho (v1.1: DM/feed/stories + câmera + WebRTC)
[ ] UA Chrome-Mobile em aparelho (v1.1: site completo sem restrição de WebView)
```

O UA equivalente ao Chrome Mobile (pendência documentada da v1.0) foi
implementado na v1.1: a UA enviada ao Instagram é derivada da UA REAL do
WebView na forma exata Chrome-Android (sem `; wv` nem `Version/N.N`) — os
números de versão acompanham o WebView instalado, sem string congelada.

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

---
status: complete
phase: 05-harness-hardening-device-validation
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md, 05-06-SUMMARY.md, 05-07-SUMMARY.md]
started: 2026-08-15T22:45:00Z
updated: 2026-08-15T23:50:00Z
confirmed: 2026-08-15T23:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. device-check.html renderiza no navegador do celular
expected: Abrir device-check.html no navegador do celular (iOS Safari ou Android Chrome): o cartão de veredito mostra Context/Phase ao vivo vindos do motor REAL (sem mocks), e as tabelas mostram os clamps (0.5/2.0/4.0) e os levers (0.85/0.65/0.4) do CONFIG.
result: pass
evidence: "Pixel 7 Pro físico via USB + adb reverse + CDP: DOM real lido do aparelho — Context: SOCIAL, Phase: 0 (3/7/12), Kill-switch: true, Overlay predicate: false (correto em rota social); clamps WebKit 0.5-2 / Chromium 0.5-4; levers 0.85/0.65/0.4 (fases 1/2/3). Screenshot: .freebuff/device-check-pixel7.png"

### 2. harness.html roda em browser puro, zero dependências
expected: Abrir test/harness.html num browser desktop comum (sem servidor, sem npm): a suíte completa roda sozinha e o rodapé mostra "TOTAL: N passed / N run" com todas as linhas em verde (PASS) — o mesmo motor e a mesma suíte do host Node, sem framework nenhum.
result: pass
evidence: "Usuário abriu test/harness.html via file:// duplo clique (sem servidor) — reportou 'TOTAL: 797 passed / 797 run' na ocasião, todas as linhas verdes, zero FAIL. Corrobora o smoke headless Edge (851/851 em 2026-08-16) e o assert de paridade do epílogo (Node 930 − 79 Node-only = 851)."

### 3. Checklist on-device — os 6 itens mapeados passam numa superfície real
expected: Seguir o 05-DEVICE-CHECKLISTS.md em pelo menos uma superfície real (iOS Safari, Android Chrome ou Android WebView): clamps exibidos no device-check, filter renderizando no iOS, volume audível, reset do relógio em ~6min de fundo, feed social (DMs/perfis) sem degradação e overlay escondido nas rotas sociais.
result: pass
evidence: "Superfície: Android Chrome no Pixel 7 Pro físico (USB + adb reverse + CDP, motor REAL injetado em instagram.com). Item 1 clamps: tabela chromium 0.5-4.0 lida do DOM (Teste 1). Item 2 filter: saturate(0.85) em 13 wrappers persistindo na fase 1; visual forte confirmado com build de teste (0.2). Item 3 volume: 6 vídeos em 0.5 (fator exato da fase 3) + confirmação audível do usuário. Item 4 reset 6min: elapsed 280s → 2s após 6+ min em background (tempo oculto nunca contado). Item 5 social: /direct/inbox/ → SOCIAL, observer desconectado, overlay off, zero levers; retorno re-engaja. Item 6 pill: '3 min' fixo (left 16 / bottom 16, z 2147483000, pointer-events none), visto pelo usuário. DOIS BUGS REAIS encontrados e corrigidos nesta UAT: (1) buildOverlayCss emitia declarações CSS sem seletor (pill virava bloco estático) — fix + teste TO05i; (2) registro por addedNodes insuficiente no feed real (IG recicla nós de vídeo) — fix scan-no-connect em connectWatcher + testes TD2/TD20/TD21 atualizados. Suite: 930 assertions verdes Node + paridade Edge (851, delta 79) em 2026-08-16. Screenshots: .freebuff/pill-evidence.png, .freebuff/test-saturation.png, .freebuff/device-check-pixel7.png"

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-05-3
  truth: "Overlay pill renderiza fixo no canto inferior esquerdo (OVER-01..03)"
  status: resolved
  resolved_by: 05-06 (UAT hotfix, same phase)
  resolved_at: 2026-08-15
  severity: major
  root_cause: "buildOverlayCss() emitia declarações CSS sem seletor (posição/left/bottom/etc. soltas no <style>) — CSS inválido descartado pelo browser; o pill virava um bloco estático no fim do body (z-index também ignorado em elemento estático). O fake shadow root nunca aplica CSS, então os asserts T-O05/T-O06 (string-only) não detectaram."
  fix: "buildOverlayCss agora emite regra válida 'div { ... }' + teste estrutural TO05i; suíte 930 verde (2026-08-16)"
- gap_id: G-05-4
  truth: "Degradação engaja em todos os vídeos do feed Reels real (HARN-01 engagement)"
  status: resolved
  resolved_by: 05-06 (UAT hotfix, same phase)
  resolved_at: 2026-08-15
  severity: major
  root_cause: "No Instagram web mobile os nós de <video> são RECICLADOS no lugar (React troca o src) em vez de re-adicionados — o registro via observer addedNodes quase não dispara depois do paint inicial, deixando o registry estrelvado (2 vídeos em minutos) e os levers sem alvo."
  fix: "connectWatcher agora faz um scan inicial de document.querySelectorAll('video') no connect (REELS-only, idempotente, mesmo padrão do fallbackScope de drift) + testes TD2/TD20/TD21 atualizados para o novo contrato; suíte 930 verde (2026-08-16); no aparelho reg 2 → 27 no connect"

# EixoVerde — Navegação & Ciclovias (DF → Brasil)

Aplicativo web progressivo (PWA) de navegação inteligente, planejamento seguro em ciclovias e telemetria personalizada para **patinetes elétricos, e-bikes, bicicletas e micromobilidade**.

## Principais Recursos (Fase 1 + Fase 2 Offline-First)
- **Mapa Vetorial Único (MapLibre GL JS):** sem troca de abas — explore, planeje, ajuste waypoints e navegue em 3D sobre o mesmo mapa em tema **Claro** (alta legibilidade diurna), **Escuro** (conforto noturno) ou **Satélite**.
- **Malha Cicloviária DF Otimizada:** dados do CicloMapa DF otimizados (-81% de tamanho) com ciclovias, ciclofaixas, vias calmas, trilhas, vias proibidas, bicicletários e oficinas.
- **Roteamento Seguro Multi-Perfil:** compare até 3 trajetos (*Mais Segura • Ciclovias*, *Equilibrada*, *Mais Rápida*) com índice de segurança, altimetria interativa, alertas de travessia arterial e recálculo automático fora da rota.
- **Minha Garagem + Comparar & Comprar:** catálogo brasileiro de patinetes elétricos, e-bikes, compartilhados (JET/Tembici), bikes convencionais e e-skates, além de cadastro de veículo personalizado com cálculo real de ETA, bateria (%) e conforto por aro/suspensão.
- **Navegação Handlebar (Modo Guidão):** rotação 3D com bússola, voz PT-BR e sinais sonoros, Wake Lock, modo demonstração e botão **Reportar Perigo** colaborativo com alertas na ciclovia.
- **Contas na Nuvem & Sincronização Offline-First (Opcional — Supabase + PostGIS):** funciona 100% localmente via IndexedDB no modo Visitante (zero chaves) e ativa automaticamente contas na nuvem, sincronização multi-dispositivo, alertas comunitários com PostGIS e proxy seguro do OpenRouteService (`ors-proxy`) quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão configurados.
- **Rotas Salvas, GPX/KML & Links Compartilháveis:** importação/exportação GPX/KML, links compartilháveis e persistência local com migração segura para a nuvem.

## Desenvolvimento Local & Verificação

```bash
npm install
npm run dev
```

Scripts de qualidade e build:

```bash
npm run typecheck   # Verificação TypeScript estrita (tsc --noEmit)
npm test            # Testes unitários e de integração (Vitest)
npm run test:e2e    # Suite E2E multi-viewport (Playwright)
npm run build       # Build de produção (tsc -b && vite build)
```

## Chaves de API & Nuvem Supabase (Opcional)

O app funciona **imediatamente sem nenhuma chave** no modo Visitante/Local usando fallback gratuito (**OpenFreeMap** + **BRouter / OSRM** + **IndexedDB**).

Para ativar **Contas na Nuvem, Sincronização Offline-First, PostGIS e Proxy seguro `ors-proxy`**, siga o passo a passo completo em **[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)**.

Variáveis opcionais para `.env.local` (desenvolvimento) ou **Settings → Secrets and variables → Actions → Repository secrets** no GitHub:

- `VITE_SUPABASE_URL` — URL do projeto Supabase (`https://<project-ref>.supabase.co`)
- `VITE_SUPABASE_ANON_KEY` — chave pública do Supabase (aceita tanto **Publishable `sb_publishable_...`** quanto **anon JWT `eyJ...`**)
- `VITE_MAPTILER_KEY` — https://cloud.maptiler.com/ (estilos MapTiler Cloud; em *Allowed HTTP Origins*, use `prodcyrup.github.io` e `localhost`, um por linha)
- `VITE_ORS_KEY` — https://account.heigit.org/ (opcional quando a Edge Function `ors-proxy` mantém `ORS_API_KEY` apenas no servidor)

## Deploy Automático no GitHub Pages

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) detecta automaticamente o nome do repositório (`/${{ github.event.repository.name }}/`) e publica no GitHub Pages a cada push na branch `main`.
No repositório do GitHub, basta selecionar **Settings → Pages → Build and deployment → Source: GitHub Actions**.

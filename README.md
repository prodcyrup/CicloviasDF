# EixoVerde — Navegação & Ciclovias (DF → Brasil)

Aplicativo web progressivo (PWA) de navegação inteligente, planejamento seguro em ciclovias e telemetria personalizada para **patinetes elétricos, e-bikes, bicicletas e micromobilidade**.

## Principais Recursos (Fase 1 — Local-First PWA)
- **Mapa Vetorial Único (MapLibre GL JS):** sem troca de abas — explore, planeje, ajuste waypoints e navegue em 3D sobre o mesmo mapa em tema **Claro (Komoot/Maps)** ou **Escuro (Waze)**.
- **Malha Cicloviária DF Otimizada:** dados do CicloMapa DF otimizados (-81% de tamanho) com ciclovias, ciclofaixas, vias calmas, trilhas, vias proibidas, bicicletários e oficinas.
- **Roteamento Seguro Multi-Perfil:** compare até 3 trajetos (*Mais Segura • Ciclovias*, *Equilibrada*, *Mais Rápida*) com índice de segurança, altimetria interativa, alertas de travessia arterial e recálculo automático fora da rota.
- **Minha Garagem + Comparar & Comprar:** catálogo brasileiro de patinetes elétricos, e-bikes, compartilhados (JET/Tembici), bikes convencionais e e-skates, além de cadastro de veículo personalizado com cálculo real de ETA, bateria (%) e conforto por aro/suspensão.
- **Navegação Handlebar (Modo Guidão):** rotação 3D com bússola, voz PT-BR e sinais sonoros, Wake Lock, modo demonstração e botão **Reportar Perigo** estilo Waze.
- **Rotas Salvas, GPX/KML & Links Compartilháveis:** persistência local em IndexedDB via `StorageAdapter` pronto para sincronização em nuvem (Supabase) na Fase 2.

## Desenvolvimento Local

```bash
npm install
npm run dev
```

## Chaves de API Gratuitas (Opcional)

O app funciona **imediatamente sem nenhuma chave** usando fallback gratuito (**OpenFreeMap** + **BRouter / OSRM**). Para ativar estilos **MapTiler Cloud** (Light/Dark/Satélite) e roteamento **OpenRouteService / HeiGIT** (2.000 rotas/dia grátis), configure as variáveis em `.env.local` (desenvolvimento) ou em **Settings → Secrets and variables → Actions → Repository secrets** no GitHub:

- `VITE_MAPTILER_KEY` — https://cloud.maptiler.com/ (em *Allowed HTTP Origins*, use `prodcyrup.github.io` e `localhost`, um por linha)
- `VITE_ORS_KEY` — https://account.heigit.org/ (copie sua *Basic Key* do OpenRouteService)

## Deploy Automático no GitHub Pages

O workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) detecta automaticamente o nome do repositório (`/${{ github.event.repository.name }}/`) e publica no GitHub Pages a cada push na branch `main`.
No repositório do GitHub, basta selecionar **Settings → Pages → Build and deployment → Source: GitHub Actions**.

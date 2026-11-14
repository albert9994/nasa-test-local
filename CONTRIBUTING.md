# Cum lucrăm în repo (citește 5 minute înainte de primul commit)

## Pe scurt
- **`main` trebuie să meargă mereu.** Nimeni nu face push direct pe `main`.
- **Un branch per task, nu per persoană.** Branch scurt (câteva ore), Pull Request, merge, șters.
- **PR mic, merge repede:** țintă < 300 linii, merge în < 30 min de la deschidere.
- **CI verde = poți face merge.** Squash merge.
- Când termini ceva care deblochează pe cineva: scrie în chat `A8 done → I3, O3 unblocked` + link la PR.

## De ce nu branch-uri per persoană (`albert`, `ion` etc.)
Un branch care trăiește tot weekendul strânge sute de modificări. La final, toți încearcă să facă merge în același timp și apar conflicte
în exact orele în care nu ai timp. Cu branch-uri scurte per task, conflictele sunt mici și se rezolvă pe loc.
Branch-urile vechi `albert` și `ion` sunt goale. Albert le poate șterge (vezi [docs/setup/ADMIN_SETUP.md](docs/setup/ADMIN_SETUP.md)).

## De ce nu direct pe `main`
Un singur commit greșit (de exemplu WASM-ul care nu mai compilează) blochează alte 4 persoane. PR-ul + CI-ul îl prind înainte.

---

## Fluxul pentru fiecare task
```bash
git switch main && git pull                      # mereu de la main la zi
git switch -c octa/O4-drought-replay             # <nume>/<ID task>-<descriere-scurtă>
# ... lucrezi, faci commit-uri mici ...
git add -p && git commit -m "O4: animated soil-water tank"
git push -u origin HEAD                          # prima dată
gh pr create --fill                              # sau din interfața GitHub
```
Apoi: CI-ul trece → **Squash and merge** → **Delete branch** → `git switch main && git pull`.

### Nume de branch
`<prenume>/<ID task>-<descriere>`. Exemple: `albert/A7-season-sim`, `moldo/M2-crops-json`, `luca/LU1-power-pipeline`,
`ionut/I6-quant`, `octa/O1-app-shell`. ID-urile sunt cele din `docs/team/*.md` și din Issues.

### Mesaje de commit
`<ID task>: <ce face>`, la prezent, scurt. Exemple: `A8: legume N credit in rotation layer`, `LU3: SoilGrids WCS fallback`.
Pune `Closes #12` în descrierea PR-ului ca să se închidă automat Issue-ul.

### Când `main` s-a mișcat sub tine
```bash
git fetch origin && git rebase origin/main      # rezolvi conflictele, apoi:
git push --force-with-lease                     # doar pe branch-ul TĂU, niciodată pe main
```

---

## Cine aprobă ce
- **Nu e nevoie de aprobare** ca să faci merge (suntem 5 și dormim în ture), dar **CI-ul trebuie să fie verde**.
- `CODEOWNERS` cere automat review de la proprietarul zonei. Dacă e treaz, așteaptă-l max. 30 min; dacă doarme, merge-ul îl face cel de serviciu
  (Albert, iar în tura de somn a lui Albert, Octa) și îi lasă un comentariu.
- **Fișierele altcuiva:** deschide PR și dă-i tag proprietarului, nu le edita pe ascuns. Proprietarii sunt în `docs/team/01_PLAN.md`.

## Ce NU intră în repo
- **Chei API / tokenuri / parole.** Cheia LLM stă doar în `.env` (local) și în secretele serverului. Copiază `.env.example` → `.env`.
- Date mari brute (NetCDF CMIP6, GeoTIFF-uri): în Drive sau într-un bucket; în repo intră doar pachetele JSON procesate (< 1 MB per fermă).
- Build-uri (`target/`, `.next/`, `node_modules/`, `packages/engine-wasm/` generat): sunt în `.gitignore`.

---

## Organizare GitHub
| Ce | Unde |
|---|---|
| **Task-urile** (din `docs/team/*.md`) | **Issues**, câte unul per task, cu persoana asignată |
| **Checkpoint-urile** CP0–CP6 | **Milestones**: fiecare Issue e pus la checkpoint-ul la care trebuie gata |
| **Zona** (engine, data, frontend, ai, quant, story) | Labels `area:*` |
| **Prioritate** | Labels `P0` (demo-ul nu merge fără) / `P1` (weekend) / `P2` (stretch) |
| Blocat? | Label `blocked` + comentariu „aștept X de la Y" |

Filtre utile: Issues → `assignee:@me milestone:"CP2 · First full loop"` → ce ai de făcut până la următorul checkpoint.

## Unelte recomandate
- `gh` (GitHub CLI) pentru PR-uri din terminal.
- VS Code cu extensiile din `.vscode/extensions.json` (îți apare prompt automat).
- Rust: `rustup`, `rustup target add wasm32-unknown-unknown`, `cargo install wasm-pack`.
- Node 22 + `pnpm` (`corepack enable`). Python 3.11+.

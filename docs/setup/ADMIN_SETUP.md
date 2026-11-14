# Admin setup (doar Albert, ~5 minute)

Restul repo-ului e deja configurat (templates, CI, labels, milestones CP0–CP6, 62 de Issues asignate).
Lucrurile de mai jos cer drept de **admin**, pe care îl are doar Albert.

## 1. Setări de merge (Settings → General → Pull Requests)
- ✅ **Allow squash merging**; ❌ dezactivează *merge commits* și *rebase merging* (istoric curat, un commit per task)
- ✅ **Automatically delete head branches** (branch-urile dispar după merge)
- ✅ **Always suggest updating pull request branches**

Sau din terminal:
```bash
gh api -X PATCH repos/albert9994/nasa-test-local \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_update_branch=true
```

## 2. Protecția pentru `main`
⚠️ **La repo-uri private pe planul gratuit GitHub, protecția de branch NU e disponibilă.** Variante:
- **a)** Faceți repo-ul **public** (oricum la submisia Space Apps trebuie un link public), **sau**
- **b)** Albert activează **GitHub Pro** (gratuit pentru studenți prin GitHub Student Developer Pack), **sau**
- **c)** Fără protecție: regula din `CONTRIBUTING.md` („nimeni nu face push direct pe main") rămâne o înțelegere de echipă.

Când e posibil (a sau b):
```bash
gh api -X PUT repos/albert9994/nasa-test-local/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["ci-ok"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```
Asta cere: **PR + CI verde (`ci-ok`)** ca să intri pe `main`; fără aprobări obligatorii (dormim în ture); fără force-push pe `main`.
`enforce_admins: false` îi lasă lui Albert o portiță pentru urgențe.

## 3. Secrete (Settings → Secrets and variables → Actions)
- `LLM_API_KEY`, `LLM_API_URL`: pentru deploy-ul serverului și testele care cheamă LLM-ul
- (mai târziu) `FLY_API_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_*`

## 4. Curățenie
Branch-urile `albert` și `ion` sunt goale (doar commit-ul inițial). Le poți șterge:
```bash
git push origin --delete albert ion
```

## 5. (Opțional) GitHub Project board
Issues → **Projects → New project → Board**, adaugă toate Issues-urile; coloane: *Todo / In progress / In review / Done*;
grupează după **Milestone** ca să vezi fiecare checkpoint.

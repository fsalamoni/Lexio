# 📦 Como subir a base Qdrant para o repositório

## Pré-requisitos

Você precisa ter instalado no seu PC:
- **Git** (já deve ter, pois clonou o repo)
- **Git LFS** (vamos instalar abaixo)

---

## Passo a passo completo (PowerShell)

### 1️⃣ Instalar Git LFS

Abra o **PowerShell como Administrador** (clique direito no menu Iniciar → "Terminal (Admin)") e execute:

```powershell
# Opção A: Se você tem o winget (Windows 10/11)
winget install GitHub.GitLFS

# Opção B: Se você tem o Chocolatey
choco install git-lfs

# Opção C: Se você tem o Scoop
scoop install git-lfs
```

> **Não tem nenhum desses?** Baixe o instalador em: https://git-lfs.github.com/
> Clique em "Download", execute o `.exe` e siga o assistente (Next → Next → Install).

Após instalar, **feche e reabra o PowerShell** e verifique:

```powershell
git lfs version
```

Deve mostrar algo como `git-lfs/3.x.x`. Se aparecer erro, reinicie o PC.

---

### 2️⃣ Clonar o repositório (se ainda não fez)

```powershell
cd D:\
git clone https://github.com/fsalamoni/Lexio.git
cd D:\Lexio
```

> Se já tem o repositório clonado, entre na pasta dele:
> ```powershell
> cd D:\Lexio   # ou onde quer que esteja seu clone
> git pull origin copilot/organize-repository-files-and-docs
> ```

---

### 3️⃣ Mudar para o branch correto

```powershell
git checkout copilot/organize-repository-files-and-docs
git pull
```

---

### 4️⃣ Ativar Git LFS no repositório

```powershell
git lfs install
```

Deve mostrar: `Git LFS initialized.`

---

### 5️⃣ Copiar os dados do Qdrant para o repositório

```powershell
# Copiar toda a pasta qdrant_storage para dentro do repositório
Copy-Item -Path "D:\AgentData\qdrant_storage\*" -Destination ".\data\qdrant_storage\" -Recurse -Force

# Verificar que os arquivos foram copiados
Get-ChildItem .\data\qdrant_storage\ -Recurse | Measure-Object | Select-Object Count
```

Deve mostrar a quantidade de arquivos copiados.

---

### 6️⃣ Verificar que o Git LFS vai rastrear os arquivos grandes

```powershell
# Ver quais arquivos serão rastreados pelo LFS
git lfs track

# Ver o status dos arquivos
git status
```

Os arquivos `.bin`, `.dat`, `.idx` etc. devem aparecer como "tracked by LFS" no `.gitattributes`.

---

### 7️⃣ Adicionar, commitar e enviar

```powershell
# Adicionar todos os arquivos
git add .

# Verificar o que será commitado
git status

# Criar o commit
git commit -m "feat: add Qdrant vector database with pre-indexed legal documents"

# Enviar para o GitHub (isso pode demorar — 761MB de upload!)
git push origin copilot/organize-repository-files-and-docs
```

> ⏳ **O push pode levar de 10 a 30 minutos** dependendo da sua internet.
> Se der timeout, tente novamente — o Git LFS retoma de onde parou.

---

### 8️⃣ Verificar que funcionou

Acesse no navegador:
```
https://github.com/fsalamoni/Lexio/tree/copilot/organize-repository-files-and-docs/data/qdrant_storage
```

Os arquivos devem aparecer com um ícone de "LFS" (arquivo grande rastreado).

---

## ⚠️ Limites do GitHub LFS (conta gratuita)

| Recurso | Limite gratuito |
|---------|----------------|
| Armazenamento | 1 GB |
| Largura de banda (download/mês) | 1 GB |

A sua pasta tem ~761 MB, então **cabe no limite gratuito**. Se precisar de mais espaço no futuro, o GitHub oferece pacotes de dados adicionais (50 GB por $5/mês).

---

## Alternativa: Upload via GitHub Release (sem LFS)

Se preferir **não usar Git LFS** para evitar limites de storage, pode comprimir e subir como Release:

```powershell
# 1. Comprimir a pasta
Compress-Archive -Path "D:\AgentData\qdrant_storage\*" -DestinationPath "D:\qdrant_storage.zip"

# 2. Instalar GitHub CLI (se não tem)
winget install GitHub.cli

# 3. Autenticar
gh auth login

# 4. Criar release com o arquivo
cd D:\Lexio
gh release create v0.1.0-data --title "Qdrant Database v0.1" --notes "Pre-indexed legal vectors for Qdrant" "D:\qdrant_storage.zip"
```

Depois, para baixar em outro PC:
```powershell
gh release download v0.1.0-data --pattern "qdrant_storage.zip"
Expand-Archive -Path qdrant_storage.zip -DestinationPath .\data\qdrant_storage\
```

---

## Usando os dados com Docker

Depois de ter os dados no repositório, basta executar:

```powershell
docker compose up qdrant
```

O `docker-compose.yml` já está configurado para montar `./data/qdrant_storage` como volume do Qdrant.

# Publicando o `@lexio/desktop`

O pacote está **pronto em metadados** (`files`, `bin`, `repository`, `os`,
`publishConfig.access: public`), mas **não publicado**. Publicar é uma decisão
sua e exige a sua conta npm — abaixo os passos.

## Pré-requisitos (decisões suas)

1. **Escopo `@lexio` no npm.** O nome é escopado (`@lexio/desktop`). Você precisa
   ser dono da org/escopo `@lexio` no npm (criar em npmjs.com → *Add Organization*),
   ou renomear o pacote para um escopo que você controle.
2. **Licença.** O repositório não tem licença declarada e o pacote está como
   `"license": "UNLICENSED"`. Para publicar **publicamente**, escolha uma licença
   (ex.: `MIT`, `Apache-2.0`) e:
   - atualize `"license"` no `package.json`;
   - adicione um arquivo `LICENSE` ao pacote (e inclua `"LICENSE"` em `files`).
3. **Tornar publicável.** Remova `"private": true` do `package.json` (o npm recusa
   publicar pacotes com `private: true`).

## Passos

```bash
cd packages/desktop

# 1) valida o conteúdo do tarball (deve conter apenas bin/, src/, README.md, package.json[, LICENSE])
npm pack --dry-run

# 2) roda os testes
npm test

# 3) login na sua conta npm
npm login

# 4) publica (scoped público)
npm publish --access public
```

## Depois de publicado

`npx @lexio/desktop` passa a funcionar globalmente. Atualize o `README.md` e o
card "Pasta local (PC)" em `/settings` se o comando de instalação mudar.

## Alternativa sem npm

Se preferir não publicar no npm, distribua um binário único:

```bash
# Node 20+ Single Executable Application, ou ferramentas como pkg/nexe
node --experimental-sea-config sea-config.json
```

Nesse caso, o card de configuração deve apontar para o binário em vez de `npx`.

## Versionamento

Use SemVer. Faça bump de `version` a cada publicação (`npm version patch|minor|major`).

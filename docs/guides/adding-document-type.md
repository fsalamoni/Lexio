# Como Adicionar um Tipo de Documento

> Em produção, tipos de documento são definidos no frontend TypeScript.

## 1. Adicionar constante
Em `frontend/src/lib/constants.ts`, adicionar o novo tipo ao mapa de labels:
```typescript
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  // ... tipos existentes ...
  novo_tipo: 'Novo Tipo de Documento',
}
```

## 2. Criar template markdown
Em `frontend/src/lib/document-structures.ts`, adicionar o template do novo tipo com hierarquia de seções, requisitos mínimos de conteúdo e camadas de citação.

## 3. Atualizar classificação
Em `frontend/src/lib/classification-data.ts`, adicionar o tipo à árvore de classificação se necessário (natureza → área → assuntos → tipos).

## 4. Atualizar Firestore types
Em `frontend/src/lib/firestore-types.ts`, atualizar o tipo `AdminDocumentType` se necessário.

## 5. Testar
- Criar documento no formulário `/documents/new`
- Verificar que o template é carregado corretamente
- Verificar que o pipeline de geração funciona com o novo tipo
- Verificar export DOCX

## 6. Admin Panel
O tipo também pode ser adicionado via Admin Panel → Tipos de Documento (CRUD), que salva no Firestore.

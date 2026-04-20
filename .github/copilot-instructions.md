# CODESYS Validator Extension Setup

## Project Overview
VS Code extension for validating Structured Text (ST) IEC 61131-3 code for CODESYS 3.5.18 compatibility with native VS Code notification APIs.

## Completed Steps

- [x] Created project structure with directories: src/, .vscode/, .github/
- [x] Created package.json with extension metadata and dependencies
- [x] Created tsconfig.json for TypeScript compilation
- [x] Implemented src/extension.ts with notification API integration:
  - `vscode.window.showInformationMessage()` for success messages
  - `vscode.window.showWarningMessage()` for validation issues
  - Modal notifications with detailed messages
- [x] Implemented src/validator.ts with CODESYS validation rules
- [x] Created .vscode/launch.json for debugging
- [x] Created .vscode/tasks.json for build tasks
- [x] Created README.md with full documentation
- [x] Created .gitignore for build artifacts

## Next Steps

1. Install Node.js and npm
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press F5 in VS Code to launch extension in debug mode
5. Test with ST files

## Commands

- **Validate current file**: Ctrl+Shift+K (or use command palette)
- **Validate all files**: Use command palette > "CODESYS: Validate All ST Files"

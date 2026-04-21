# CODESYS Validator Extension

A VS Code extension for validating Structured Text (ST) IEC 61131-3 code for CODESYS 3.5.18 compatibility with native VS Code notifications.

## Features

- **Real-time Validation**: Validates ST code on file save (configurable)
- **Native Notifications**: Uses VS Code's native `window.showInformationMessage()`, `showWarningMessage()`, and `showErrorMessage()` APIs for user feedback
- **Syntax Checking**: Detects common ST syntax issues including:
  - Invalid array bounds
  - Missing control structure keywords (THEN, DO, END_IF, etc.)
  - Data type mismatches
  - Variable declaration issues
  - Invalid assignment operators (= instead of :=)

- **Batch Validation**: Validate all ST files in workspace at once
- **Detailed Messages**: Shows line numbers and specific error descriptions
- **Configurable**: Enable/disable on-save validation and detailed messages

## Commands

- **CODESYS: Validate ST Code** (`Ctrl+Shift+K` or `Ctrl+S`)
  - Validates the currently open ST file and shows results in a notification

- **CODESYS: Validate All ST Files**
  - Runs validation on all `.st` files in the workspace


## Notifications Used

The extension uses the following VS Code Notification APIs:

- `vscode.window.showInformationMessage()` - Success messages
- `vscode.window.showWarningMessage()` - Issues found
- `vscode.window.showErrorMessage()` - (reserved for critical errors)

All notifications support:
- **Modal option**: Can be set for more prominent alerts
- **Detail text**: Provides additional information in modal messages
- **Action buttons**: Users can interact with notification options

## Installation

- Could need to restart VSC in order to make it function properly

```
.
├── src/
│   ├── extension.ts       # Main extension entry point
│   └── validator.ts       # CODESYS ST validation logic
├── .vscode/
│   ├── launch.json        # Debug configuration
│   └── tasks.json         # Build tasks
├── package.json           # Extension metadata and dependencies
└── tsconfig.json          # TypeScript configuration
```

## How It Works

1. **Activation**: Extension activates when opening ST files or on workspace open
2. **Validation**: Simulates CODESYS 3.5.18 compilation rules
3. **Notifications**: Issues found are reported via VS Code native notification APIs
4. **Options**: Modal messages show detailed error information with line numbers

## Example Issues Detected

- ❌ `ARRAY[5..0] OF INT` → "Array bounds invalid: start index greater than end index"
- ❌ `IF condition DO` → "IF statement missing THEN keyword"
- ❌ `variable = value` → "ST uses := for assignment, not ="
- ⚠️ `value : REAL := 42` → "REAL literal should have decimal point (e.g., 42.0)"

## License

MIT

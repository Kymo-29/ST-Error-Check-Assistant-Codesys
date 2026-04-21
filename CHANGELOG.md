# Change Log

All notable changes to the "CODESYS Validator" extension will be documented in this file.

## [0.0.3] - 2026-04-

### Added
- 

## [0.0.2] - 2026-04-20

### Modified
- Icon changes
  - More readable design
- No changes in code or features

## [0.0.1] - 2026-04-20

### Added
- Initial release of CODESYS Validator extension
- Real-time validation of Structured Text (ST) IEC 61131-3 code for CODESYS 3.5.18 compatibility
- Native VS Code notification system for validation results
- Syntax checking for common ST programming errors:
  - Invalid array bounds
  - Missing control structure keywords (THEN, DO, END_IF, etc.)
  - Data type mismatches
  - Variable declaration issues
  - Invalid assignment operators
- Batch validation command for all ST files in workspace
- Configurable on-save validation
- Detailed error messages with line numbers
- Command palette integration
- Keyboard shortcut (Ctrl+Shift+K) for quick validation

### Features
- **CODESYS: Validate ST Code** - Validate currently open file
- **CODESYS: Validate All ST Files** - Validate entire workspace
- Configuration options for validation behavior

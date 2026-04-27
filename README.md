# ST Error Check Assistant — CODESYS

A VS Code extension for validating Structured Text (ST / IEC 61131-3) code targeting **CODESYS 3.5.18**.

---

## Features

- **Real-time diagnostics** in the Problems panel (red/yellow squiggles)
- **On-save validation** (configurable)
- **Batch validation** — all `.st` files in the workspace
- **Parameter name completion** when typing `(` for Standard / Util function blocks outside `VAR` blocks
- **Ctrl+Shift+K** shortcut to validate the active file
- Configurable via VS Code settings

---

## Commands

| Command | Shortcut | Description |
|---|---|---|
| `CODESYS: Validate ST Code` | `Ctrl+Shift+K` | Validate the active ST file |
| `CODESYS: Validate All ST Files` | — | Validate all `.st` files in workspace |

---

## Checks Performed

### Syntax
- Missing semicolons on assignments, function calls, and `END_*` closers
- `=` used instead of `:=` for assignment
- `IF` without `THEN`; `ELSE`/`ELSIF` with trailing `;`

### Data types
- `REAL`/`LREAL` literal without decimal point (`42` → should be `42.0`)
- Variable declaration missing type annotation inside `VAR` blocks
- `VAR CONSTANT` without initialiser (`:=`)
- Unknown element type in `ARRAY … OF <type>`

### Block structure
- Unmatched block openers/closers (across the whole document)
- Mismatched pairs (e.g. `END_WHILE` inside a `FOR` block)

### Loops & control flow
- `FOR` loop missing `:=`, `TO`, or `DO`
- `WHILE` loop missing `DO`
- `UNTIL` missing trailing `;`
- `CASE` missing `OF`

### Function blocks
- Standard and Util FB / function parameter validation
- Standard FB calls missing required parameters (`IN`/`PT`, `CU`/`CD`/`PV`)
- `PID` call missing `ACTUAL`/`SET_POINT`
- `Util.BLINK` call missing `ENABLE`/`EN`, `TIMELOW`/`TLOW`, `TIMEHIGH`/`THIGH`, `OUT`/`Q`
- Exact parameter type strings preserved from workbook definitions (`STRING (255)`, `INT`, `TIME`, etc.)
- Expected parameter style and type hints for common Standard and Util FBs (`TIMELOW : TIME`, `OUT : BOOL`, `ACTUAL : REAL`, etc.)
- `ENABLE =>` used instead of `EN`/`ENO`

---

## Examples of Issues Detected

```st
(* Array bounds *)
myArray : ARRAY[5..0] OF INT;      (* ERROR: start > end *)

(* REAL literal *)
myVal : REAL := 42;                (* WARNING: should be 42.0 *)

(* FOR loop *)
FOR i = 0 TO 9 DO                  (* ERROR: use := not = *)
FOR i := 0 TO 9                    (* WARNING: missing DO *)

(* CASE *)
CASE myVar                          (* ERROR: missing OF *)

(* Constant *)
VAR CONSTANT pi : REAL; END_VAR    (* ERROR: missing := *)

(* Assignment *)
myVar = 5;                          (* WARNING: use := *)

(* Timer call *)
myTon(Q => result);                (* WARNING: missing IN and PT *)

(* Util.BLINK call *)
myBlink(ENABLE := start, TIMELOW := T#100ms, TIMEHIGH := T#200ms, OUT => led);
                                    (* WARNING: missing expected BLINK parameters or incorrect parameter styles *)

(* Block mismatch *)
IF cond THEN
  ...
END_FOR;                           (* ERROR: END_FOR closes FOR, not IF *)
```

---

## Project Structure

```
.
├── src/
│   ├── extension.ts       # Extension entry point
│   └── validator.ts       # IEC 61131-3 / CODESYS validation logic
├── package.json           # Extension manifest
└── tsconfig.json          # TypeScript configuration
```

---

## License

MIT


## v0.0.3 improvements
- Numeric range validation for IEC integer types (USINT, UINT, SINT, INT, DINT, etc.).
- TIME literals now require units (ms, s, m, h, d).
- New workbook-driven Standard/Util library validation.
- Parameter name completion while typing `(` outside `VAR` blocks for Standard and Util FBs.
- Improved Function Block parameter checks with exact type text from workbook definitions.
- Detects wrong use of => for FB inputs (expects :=).

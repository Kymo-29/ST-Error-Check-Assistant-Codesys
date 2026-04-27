# Changelog

## [0.0.3] — 2026-04-27

### Added
- **Full IEC 61131-3 elementary type set** recognised by the validator (BOOL, SINT, INT, DINT, LINT, USINT, UINT, UDINT, ULINT, BYTE, WORD, DWORD, LWORD, REAL, LREAL, TIME, DATE, DATE_AND_TIME, DT, TIME_OF_DAY, TOD, STRING, WSTRING)
- **Standard Function Blocks** validated: TON, TOF, TP, CTU, CTD, CTUD, SR, RS, R_TRIG, F_TRIG, RTC
- **CODESYS Util library Function Blocks** recognised: HYSTERESIS, LIMITALARM, BIT_AS_BYTE, BIT_AS_DWORD, BIT_AS_WORD, BYTE_AS_BIT, DWORD_AS_BIT, UNPACK, WORD_AS_BIT, PD, PID, PID_FIXCYCLE, DERIVATIVE, INTEGRAL, LIN_TRAFO, ROTATION_DIFFERENCE, STATISTICS_INT, STATISTICS_REAL, VARIANCE, BLINK, FREQ_MEASURE
- **FB call parameter validation**: checks TON/TOF/TP for IN and PT; CTU/CTD for count pin and PV; PID for ACTUAL and SET_POINT; BLINK for ENABLE/EN, TIMELOW/TLOW, TIMEHIGH/THIGH, OUT/Q
- **Workbook-driven library validation**: imported Standard / Util FB and function definitions 
- **Parameter completion** support when typing `(` for Standard / Util FBs outside `VAR` blocks, and after 2 seconds of inactivity while editing inside function/FB call parentheses
- **Variable declaration validation**: known IEC/CODESYS types recognised, unknown types warn users, and type hints are inferred for FB parameter checks
- **Block structure matching** (Pass 2): detects unmatched VAR/END_VAR, PROGRAM/END_PROGRAM, FUNCTION_BLOCK/END_FUNCTION_BLOCK, IF/END_IF, FOR/END_FOR, WHILE/END_WHILE, REPEAT/END_REPEAT, CASE/END_CASE, TYPE/END_TYPE, STRUCT/END_STRUCT
- **FOR loop syntax** checks: validates := , TO, and DO keywords
- **WHILE loop** checks DO keyword
- **REPEAT/UNTIL** checks semicolon after condition
- **CASE statement** checks OF keyword
- **LREAL** literal also validated (not only REAL)
- Improved comment stripping: nested inline `(* … *)` and string literals `'…'` stripped before analysis
- Warning when `ENABLE =>` used instead of `EN`/`ENO`

### Changed
- `validator.ts` fully rewritten with two-pass analysis
- Version bumped to `0.0.3`
- README updated with comprehensive feature table and examples

---

## [0.0.2] — 2026-04-20

### Added
- Initial semicolon checking for assignment statements, function calls, and END_* closers
- Array bounds validation (start > end)
- REAL literal decimal-point check
- VAR CONSTANT initialiser check
- Basic IF/THEN, FOR/DO, WHILE/DO control structure checks
- Assignment operator = vs := detection
- On-save validation and batch validation commands
- Ctrl+Shift+K keybinding

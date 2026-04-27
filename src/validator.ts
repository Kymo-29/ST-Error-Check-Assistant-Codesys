/**
 * CODESYS ST IEC 61131-3 Validator — v0.0.3
 * Validates Structured Text code for CODESYS 3.5.18 compatibility.
 *
 * Checks performed:
 *  - Data types (IEC elementary + STRING/WSTRING/TIME/DATE/DT/TOD)
 *  - Standard function blocks (TON, TOF, TP, CTU, CTD, CTUD, RS, SR, R_TRIG, F_TRIG)
 *  - Util library function blocks (BLINK, HYSTERESIS, DERIVATIVE, INTEGRAL, PID, RAMP, etc.)
 *  - Block structure matching (VAR…END_VAR, PROGRAM…END_PROGRAM, IF…END_IF, FOR…END_FOR, etc.)
 *  - FOR / WHILE / REPEAT / UNTIL loop syntax
 *  - CASE … OF … END_CASE structure
 *  - Assignment operator (:= vs =)
 *  - Missing semicolons (statements, closers, function calls)
 *  - Array bounds validation
 *  - REAL/LREAL literal format
 *  - VAR CONSTANT must have initialiser
 */

import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

interface ValidationIssue {
	line: number;
	message: string;
	severity: 'error' | 'warning';
}

interface LibraryRule {
	requiredInputs?: Array<string | string[]>;
	requiredOutputs?: Array<string | string[]>;
	typeHints?: Record<string, string>;
	inputStyle?: ':=';
	outputStyle?: '=>';
}

interface CompletionParameter {
	label: string;
	insertText: string;
	detail: string;
}

function normalizeParamName(name: string): string {
	return name.trim().toUpperCase();
}

function parseLibraryWorkbook(workspaceRoot?: string): Record<string, LibraryRule> {
	if (!workspaceRoot) {
		return {};
	}
	const workbookPath = path.join(workspaceRoot, 'CODESYS_Bibliotheques.xlsx');
	if (!fs.existsSync(workbookPath)) {
		return {};
	}

	try {
		const workbook = xlsx.readFile(workbookPath);
		const sheetName = workbook.SheetNames[0];
		if (!sheetName) {
			return {};
		}
		const sheet = workbook.Sheets[sheetName];
		const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
		const rules: Record<string, LibraryRule> = {};

		for (let index = 1; index < rows.length; index++) {
			const row = rows[index];
			if (!row || row.length < 4) { continue; }
			const element = String(row[1] || '').trim();
			const kind = String(row[2] || '').trim().toUpperCase();
			const params = String(row[3] || '');
			if (!element || !kind || !params) { continue; }
			if (kind !== 'FB' && kind !== 'FUN') { continue; }

			const ruleName = element.toUpperCase();
			const rule: LibraryRule = {};
			const lines = params.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
			for (const paramLine of lines) {
				const matches = paramLine.match(/^([\w\d_]+)\s*\(([^)]+)\)\s*:\s*(INPUT|OUTPUT|RETURN|CONSTANT)$/i);
				if (!matches) { continue; }
				const paramName = matches[1].trim();
				const paramType = matches[2].trim();
				const direction = matches[3].toUpperCase();
				if (!rule.typeHints) { rule.typeHints = {}; }
				rule.typeHints[normalizeParamName(paramName)] = paramType;
				if (direction === 'INPUT') {
					if (!rule.requiredInputs) { rule.requiredInputs = []; }
					rule.requiredInputs.push([normalizeParamName(paramName)]);
				} else if (direction === 'OUTPUT') {
					if (!rule.requiredOutputs) { rule.requiredOutputs = []; }
					rule.requiredOutputs.push(normalizeParamName(paramName));
				}
			}

			if (kind === 'FB') {
				rule.inputStyle = ':=';
				rule.outputStyle = '=>';
			} else if (kind === 'FUN') {
				rule.inputStyle = ':=';
			}

			if (Object.keys(rule).length > 0) {
				rules[ruleName] = rule;
			}
		}

		return rules;
	} catch {
		return {};
	}
}

function mergeRules(primary: Record<string, LibraryRule>, secondary: Record<string, LibraryRule>): Record<string, LibraryRule> {
	const merged: Record<string, LibraryRule> = { ...primary };
	for (const [name, rule] of Object.entries(secondary)) {
		if (!merged[name]) {
			merged[name] = rule;
			continue;
		}
		const base = merged[name];
		if (!base.requiredInputs && rule.requiredInputs) {
			base.requiredInputs = rule.requiredInputs;
		}
		if (!base.requiredOutputs && rule.requiredOutputs) {
			base.requiredOutputs = rule.requiredOutputs;
		}
		base.typeHints = { ...(base.typeHints || {}), ...(rule.typeHints || {}) };
		if (!base.inputStyle && rule.inputStyle) {
			base.inputStyle = rule.inputStyle;
		}
		if (!base.outputStyle && rule.outputStyle) {
			base.outputStyle = rule.outputStyle;
		}
	}
	return merged;
}

// ────────────────────────────────────────────────────────────────
//  IEC 61131-3 / CODESYS known type & keyword sets
// ────────────────────────────────────────────────────────────────

const IEC_ELEMENTARY_TYPES = new Set([
	'BOOL',
	'SINT', 'INT', 'DINT', 'LINT',
	'USINT', 'UINT', 'UDINT', 'ULINT',
	'BYTE', 'WORD', 'DWORD', 'LWORD',
	'REAL', 'LREAL',
	'TIME', 'DATE', 'DATE_AND_TIME', 'DT', 'TIME_OF_DAY', 'TOD',
	'STRING', 'WSTRING',
	'ARRAY', 'POINTER',
]);

/** Standard Function Blocks — IEC 61131-3 Standard Library */
const STANDARD_FB_TYPES = new Set([
	'TON', 'TOF', 'TP',
	'CTU', 'CTD', 'CTUD',
	'SR', 'RS',
	'R_TRIG', 'F_TRIG',
	'SEMA',
]);

/** CODESYS Util library function blocks */
const UTIL_FB_TYPES = new Set([
	'BLINK',
	'HYSTERESIS',
	'DERIVATIVE',
	'INTEGRAL',
	'PID',
	'RAMP',
	'AVERAGE',
	'DEADTIME',
	'LIMITALARM',
	'LATCH',
	'SEARCH_DATA_BYTE', 'SEARCH_DATA_WORD', 'SEARCH_DATA_DWORD',
	'RNG_INT', 'RNG_DINT', 'RNG_REAL',
	'STATISTICS_INT', 'STATISTICS_REAL',
	'DELAY',
	'PULSEWIDTH',
	'SAWTOOTH',
	'TRIANGLE',
	'SINEWAVE',
]);

const ALL_KNOWN_TYPES = new Set([
	...IEC_ELEMENTARY_TYPES,
	...STANDARD_FB_TYPES,
	...UTIL_FB_TYPES,
]);

const TYPE_HINTS: Record<string, string> = {
	BOOL: 'BOOL',
	SINT: 'SINT',
	INT: 'INT',
	DINT: 'DINT',
	LINT: 'LINT',
	USINT: 'USINT',
	UINT: 'UINT',
	UDINT: 'UDINT',
	ULINT: 'ULINT',
	BYTE: 'BYTE',
	WORD: 'WORD',
	DWORD: 'DWORD',
	LWORD: 'LWORD',
	REAL: 'REAL',
	LREAL: 'LREAL',
	TIME: 'TIME',
	DATE: 'DATE',
	DATE_AND_TIME: 'DATE_AND_TIME',
	DT: 'DT',
	TIME_OF_DAY: 'TIME_OF_DAY',
	TOD: 'TOD',
	STRING: 'STRING',
	WSTRING: 'WSTRING',
};

const BUILTIN_FB_PARAMETER_RULES: Record<string, LibraryRule> = {
    BLINK: {
        requiredInputs: [['ENABLE'], ['TIMELOW'], ['TIMEHIGH']],
        requiredOutputs: ['OUT'],
        typeHints: { ENABLE: 'BOOL', TIMELOW: 'TIME', TIMEHIGH: 'TIME', OUT: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    TON: {
        requiredInputs: [['IN'], ['PT']],
        requiredOutputs: ['Q', 'ET'],
        typeHints: { IN: 'BOOL', PT: 'TIME', Q: 'BOOL', ET: 'TIME' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    TOF: {
        requiredInputs: [['IN'], ['PT']],
        requiredOutputs: ['Q', 'ET'],
        typeHints: { IN: 'BOOL', PT: 'TIME', Q: 'BOOL', ET: 'TIME' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    TP: {
        requiredInputs: [['IN'], ['PT']],
        requiredOutputs: ['Q', 'ET'],
        typeHints: { IN: 'BOOL', PT: 'TIME', Q: 'BOOL', ET: 'TIME' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    CTU: {
        requiredInputs: [['CU'], ['PV'], ['RESET']],
        requiredOutputs: [['Q'], ['CV']],
        typeHints: { CU: 'BOOL', PV: 'UINT', RESET: 'BOOL', Q: 'BOOL', CV: 'UINT' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    CTD: {
        requiredInputs: [['CD'], ['PV'], ['RESET']],
        requiredOutputs: [['Q'], ['CV']],
        typeHints: { CD: 'BOOL', PV: 'UINT', RESET: 'BOOL', Q: 'BOOL', CV: 'UINT' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    CTUD: {
        requiredInputs: [['CU'], ['CD'], ['PV'], ['RESET']],
        requiredOutputs: [['QU'], ['QD'], ['CV']],
        typeHints: { CU: 'BOOL', CD: 'BOOL', PV: 'UINT', RESET: 'BOOL', QU: 'BOOL', QD: 'BOOL', CV: 'UINT' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    PID: {
        requiredInputs: [['ACTUAL'], ['SET_POINT'], ['KP'], ['TN'], ['TV'], ['Y_MANUAL'], ['Y_OFFSET'], ['Y_MIN'], ['Y_MAX'], ['MANUAL'], ['RESET']],
        requiredOutputs: [['Y'], ['LIMITS_ACTIVE'], ['OVERFLOW']],
        typeHints: { ACTUAL: 'REAL', SET_POINT: 'REAL', KP: 'REAL', TN: 'REAL', TV: 'REAL', Y_MANUAL: 'REAL', Y_OFFSET: 'REAL', Y_MIN: 'REAL', Y_MAX: 'REAL', MANUAL: 'BOOL', RESET: 'BOOL', Y: 'REAL', LIMITS_ACTIVE: 'BOOL', OVERFLOW: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    R_TRIG: {
        requiredInputs: [['CLK']],
        requiredOutputs: ['Q'],
        typeHints: { CLK: 'BOOL', Q: 'BOOL' },
        inputStyle: ':=',
    },
    F_TRIG: {
        requiredInputs: [['CLK']],
        requiredOutputs: ['Q'],
        typeHints: { CLK: 'BOOL', Q: 'BOOL' },
        inputStyle: ':=',
    },
    SR: {
        requiredInputs: [['SET1'], ['RESET']],
        requiredOutputs: ['Q1'],
        typeHints: { S: 'BOOL', R: 'BOOL', Q: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    RS: {
        requiredInputs: [['SET'], ['RESET1']],
        requiredOutputs: ['Q1'],
        typeHints: { S: 'BOOL', R: 'BOOL', Q: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    RTC: {
        requiredInputs: ['EN', 'PDT'],
        requiredOutputs: ['Q', 'CDT'],
        typeHints: { EN: 'BOOL', PDT: 'DT', Q: 'BOOL', CDT: 'DT' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    HYSTERESIS: {
        requiredInputs: [['IN'], ['HIGH'], ['LOW']],
        requiredOutputs: ['OUT'],
        typeHints: { IN: 'INT', HIGH: 'INT', LOW: 'INT', OUT: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    LIMITALARM: {
        requiredInputs: [['IN'], ['HIGH'], ['LOW']],
        requiredOutputs: [['O'], ['U'], ['IL']],
        typeHints: { IN: 'INT', HIGH: 'INT', LOW: 'INT', O: 'BOOL', U: 'BOOL', IL: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    BIT_AS_BYTE: {
        requiredInputs: [['B0'], ['B1'], ['B2'], ['B3'], ['B4'], ['B5'], ['B6'], ['B7']],
        requiredOutputs: ['B'],
        typeHints: { B0: 'BOOL', B1: 'BOOL', B2: 'BOOL', B3: 'BOOL', B4: 'BOOL', B5: 'BOOL', B6: 'BOOL', B7: 'BOOL', B: 'BYTE' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    BIT_AS_DWORD: {
        requiredInputs: [['B00'], ['B01'], ['B02'], ['B03'], ['B04'], ['B05'], ['B06'], ['B07'], ['B08'], ['B09'], ['B10'], ['B11'], ['B12'], ['B13'], ['B14'], ['B15'], ['B16'], ['B17'], ['B18'], ['B19'], ['B20'], ['B21'], ['B22'], ['B23'], ['B24'], ['B25'], ['B26'], ['B27'], ['B28'], ['B29'], ['B30'], ['B31']],
        requiredOutputs: ['X'],
        typeHints: { B00: 'BOOL', B01: 'BOOL', B02: 'BOOL', B03: 'BOOL', B04: 'BOOL', B05: 'BOOL', B06: 'BOOL', B07: 'BOOL', B08: 'BOOL', B09: 'BOOL', B10: 'BOOL', B11: 'BOOL', B12: 'BOOL', B13: 'BOOL', B14: 'BOOL', B15: 'BOOL', B16: 'BOOL', B17: 'BOOL', B18: 'BOOL', B19: 'BOOL', B20: 'BOOL', B21: 'BOOL', B22: 'BOOL', B23: 'BOOL', B24: 'BOOL', B25: 'BOOL', B26: ' BOOL', B27: ' BOOL', B28: ' BOOL', B29: ' BOOL', B30: ' BOOL', B31: ' BOOL', X: 'DWORD' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    BIT_AS_WORD: {
        requiredInputs: [['B00'], ['B01'], ['B02'], ['B03'], ['B04'], ['B05'], ['B06'], ['B07'], ['B08'], ['B09'], ['B10'], ['B11'], ['B12'], ['B13'], ['B14'], ['B15']],
        requiredOutputs: ['W'],
        typeHints: { B00: 'BOOL', B01: 'BOOL', B02: 'BOOL', B03: 'BOOL', B04: 'BOOL', B05: 'BOOL', B06: 'BOOL', B07: 'BOOL', B08: 'BOOL', B09: 'BOOL', B10: 'BOOL', B11: 'BOOL', B12: 'BOOL', B13: 'BOOL', B14: 'BOOL', B15: 'BOOL', W: 'WORD' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    BYTE_AS_BIT: {
        requiredInputs: ['B'],
        requiredOutputs: [['B0'], ['B1'], ['B2'], ['B3'], ['B4'], ['B5'], ['B6'], ['B7']],
        typeHints: { B: 'BYTE', B0: 'BOOL', B1: 'BOOL', B2: 'BOOL', B3: 'BOOL', B4: 'BOOL', B5: 'BOOL', B6: 'BOOL', B7: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    DWORD_AS_BIT: {
        requiredInputs: ['X'],
        requiredOutputs: [['B00'], ['B01'], ['B02'], ['B03'], ['B04'], ['B05'], ['B06'], ['B07'], ['B08'], ['B09'], ['B10'], ['B11'], ['B12'], ['B13'], ['B14'], ['B15'], ['B16'], ['B17'], ['B18'], ['B19'], ['B20'], ['B21'], ['B22'], ['B23'], ['B24'], ['B25'], ['B26'], ['B27'], ['B28'], ['B29'], ['B30'], ['B31']],
        typeHints: { X: 'DWORD', B00: 'BOOL', B01: 'BOOL', B02: 'BOOL', B03: 'BOOL', B04: 'BOOL', B05: 'BOOL', B06: 'BOOL', B07: 'BOOL', B08: 'BOOL', B09: 'BOOL', B10: 'BOOL', B11: 'BOOL', B12: 'BOOL', B13: 'BOOL', B14: 'BOOL', B15: 'BOOL', B16: 'BOOL', B17: 'BOOL', B18: 'BOOL', B19: 'BOOL', B20: 'BOOL', B21: 'BOOL', B22: 'BOOL', B23: 'BOOL', B24: 'BOOL', B25: ' BOOL', B26: ' BOOL', B27: ' BOOL', B28: ' BOOL', B29: ' BOOL', B30: ' BOOL', B31: ' BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    UNPACK: {
        requiredInputs: ['B'],
        requiredOutputs: [['B0'], ['B1'], ['B2'], ['B3'], ['B4'], ['B5'], ['B6'], ['B7']],
        typeHints: { B: 'BYTE', B0: 'BOOL', B1: 'BOOL', B2: 'BOOL', B3: 'BOOL', B4: 'BOOL', B5: 'BOOL', B6: 'BOOL', B7: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    WORD_AS_BIT: {
        requiredInputs: ['W'],
        requiredOutputs: [['B00'], ['B01'], ['B02'], ['B03'], ['B04'], ['B05'], ['B06'], ['B07'], ['B08'], ['B09'], ['B10'], ['B11'], ['B12'], ['B13'], ['B14'], ['B15']],
        typeHints: { W: 'WORD', B00: 'BOOL', B01: 'BOOL', B02: 'BOOL', B03: 'BOOL', B04: 'BOOL', B05: 'BOOL', B06: 'BOOL', B07: 'BOOL', B08: 'BOOL', B09: 'BOOL', B10: 'BOOL', B11: 'BOOL', B12: 'BOOL', B13: 'BOOL', B14: 'BOOL', B15: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    PD: {
        requiredInputs: [['ACTUAL'], ['SET_POINT'], ['KP'], ['TV'], ['Y_MANUAL'], ['Y_OFFSET'], ['Y_MIN'], ['Y_MAX'], ['MANUAL'], ['RESET']],
        requiredOutputs: [['Y'], ['LIMITS_ACTIVE']],
        typeHints: { ACTUAL: 'REAL', SET_POINT: 'REAL', KP: 'REAL', TV: 'REAL', Y_MANUAL: 'REAL', Y_OFFSET: 'REAL', Y_MIN: 'REAL', Y_MAX: 'REAL', MANUAL: 'BOOL', RESET: 'BOOL', Y: 'REAL', LIMITS_ACTIVE: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    PID_FIXCYCLE: {
        requiredInputs: [['ACTUAL'], ['SET_POINT'], ['KP'], ['TN'], ['TV'], ['Y_MANUAL'], ['Y_OFFSET'], ['Y_MIN'], ['Y_MAX'], ['MANUAL'], ['RESET'], ['CYCLE']],
        requiredOutputs: [['Y'], ['LIMITS_ACTIVE'], ['OVERFLOW']],
        typeHints: { ACTUAL: 'REAL', SET_POINT: 'REAL', KP: 'REAL', TN: 'REAL', TV: 'REAL', Y_MANUAL: 'REAL', Y_OFFSET: 'REAL', Y_MIN: 'REAL', Y_MAX: 'REAL', MANUAL: 'BOOL', RESET: 'BOOL', CYCLE: 'REAL', Y: 'REAL', LIMITS_ACTIVE: 'BOOL', OVERFLOW: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    DERIVATIVE: {
        requiredInputs: [['IN'], ['TM'], ['RESET']],
        requiredOutputs: ['OUT'],
        typeHints: { IN: 'REAL', TM: 'DWORD', RESET: 'BOOL', OUT: 'REAL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    INTEGRAL: {
        requiredInputs: [['IN'], ['TM'], ['RESET']],
        requiredOutputs: [['OUT'], ['OVERFLOW']],
        typeHints: { IN: 'REAL', TM: 'DWORD', RESET: 'BOOL', OUT: 'REAL', OVERFLOW: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    LIN_TRAFO: {
        requiredInputs: [['IN_MIN'], ['IN_MAX'], ['OUT_MIN'], ['OUT_MAX']],
        requiredOutputs: ['OUT'],
        typeHints: { IN_MIN: 'REAL', IN_MAX: 'REAL', OUT_MIN: 'REAL', OUT_MAX: 'REAL', OUT: 'REAL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    ROTATION_DIFFERENCE: {
        requiredInputs: [['curValue'], ['lastValue']],
        requiredOutputs: ['diffValues'],
        typeHints: { curValue: 'INT', lastValue: 'INT', diffValues: 'INT' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    STATISTICS_INT: {
        requiredInputs: [['IN'], ['RESET']],
        requiredOutputs: [['MN'], ['MX'], ['AVG']],
        typeHints: { IN: 'INT', RESET: 'BOOL', MN: 'INT', MX: 'INT', AVG: 'INT' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    STATISTICS_REAL: {
        requiredInputs: [['IN'], ['RESET']],
        requiredOutputs: [['MN'], ['MX'], ['AVG']],
        typeHints: { IN: 'REAL', RESET: 'BOOL', MN: 'REAL', MX: 'REAL', AVG: 'REAL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    VARIANCE: {
        requiredInputs: [['IN'], ['RESET']],
        requiredOutputs: ['OUT'],
        typeHints: { IN: 'REAL', RESET: 'BOOL', OUT: 'REAL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
    FREQ_MEASURE: {
        requiredInputs: [['IN'], ['PERIODS'], ['RESET']],
        requiredOutputs: [['OUT'], ['VALID']],
        typeHints: { IN: 'BOOL', PERIODS: 'UINT', RESET: 'BOOL', OUT: 'REAL', VALID: 'BOOL' },
        inputStyle: ':=',
        outputStyle: '=>',
    },
};

/** Keywords that appear as standalone lines — no semicolon required */
const BLOCK_KEYWORDS_NO_SEMI: string[] = [
	'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT',
	'VAR_GLOBAL', 'VAR_EXTERNAL', 'VAR_TEMP', 'VAR_STAT',
	'VAR CONSTANT', 'VAR_GLOBAL CONSTANT',
	'END_VAR',
	'PROGRAM', 'END_PROGRAM',
	'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK',
	'FUNCTION', 'END_FUNCTION',
	'ACTION', 'END_ACTION',
	'TYPE', 'END_TYPE',
	'STRUCT', 'END_STRUCT',
	'THEN', 'ELSE', 'ELSIF',
	'IF', 'END_IF',
	'FOR', 'DO', 'END_FOR',
	'WHILE', 'END_WHILE',
	'REPEAT', 'END_REPEAT',
	'CASE', 'OF', 'END_CASE',
	'RETURN', 'EXIT', 'CONTINUE',
	'NAMESPACE', 'END_NAMESPACE',
];

/** Block openers → expected closing keyword */
const BLOCK_OPENERS: Record<string, string> = {
	'VAR': 'END_VAR',
	'VAR_INPUT': 'END_VAR',
	'VAR_OUTPUT': 'END_VAR',
	'VAR_IN_OUT': 'END_VAR',
	'VAR_GLOBAL': 'END_VAR',
	'VAR_EXTERNAL': 'END_VAR',
	'VAR_TEMP': 'END_VAR',
	'VAR_STAT': 'END_VAR',
	'PROGRAM': 'END_PROGRAM',
	'FUNCTION_BLOCK': 'END_FUNCTION_BLOCK',
	'FUNCTION': 'END_FUNCTION',
	'ACTION': 'END_ACTION',
	'TYPE': 'END_TYPE',
	'STRUCT': 'END_STRUCT',
	'IF': 'END_IF',
	'FOR': 'END_FOR',
	'WHILE': 'END_WHILE',
	'REPEAT': 'END_REPEAT',
	'CASE': 'END_CASE',
	'NAMESPACE': 'END_NAMESPACE',
};

// ────────────────────────────────────────────────────────────────
//  Utility helpers
// ────────────────────────────────────────────────────────────────

function removeStringLiterals(line: string): string {
	return line.replace(/'[^']*'/g, "''");
}

function removeComments(line: string): string {
	let result = line;
	// Single-line //
	const slIdx = result.indexOf('//');
	if (slIdx !== -1) { result = result.substring(0, slIdx); }
	// Inline block (* … *)
	let start = result.indexOf('(*');
	while (start !== -1) {
		const end = result.indexOf('*)', start + 2);
		if (end !== -1) {
			result = result.substring(0, start) + result.substring(end + 2);
			start = result.indexOf('(*');
		} else {
			result = result.substring(0, start);
			break;
		}
	}
	return result;
}

// ────────────────────────────────────────────────────────────────
//  Main validator
// ────────────────────────────────────────────────────────────────

export class CodesysValidator {
	private issues: ValidationIssue[] = [];
	private ruleMap: Record<string, LibraryRule>;

	constructor(workspaceRoot?: string) {
		const workbookRules = parseLibraryWorkbook(workspaceRoot);
		this.ruleMap = Object.keys(workbookRules).length
			? mergeRules(workbookRules, BUILTIN_FB_PARAMETER_RULES)
			: BUILTIN_FB_PARAMETER_RULES;
	}

	validateDocument(content: string, _fileName: string): ValidationIssue[] {
		this.issues = [];
		const lines = content.split(/\r?\n/);
		const declarations: Record<string,string> = {};

		// ── Pass 1: line-by-line checks ──────────────────────────
		let inMultilineComment = false;
		let inVarBlock = false;

		for (let i = 0; i < lines.length; i++) {
			const lineNumber = i + 1;
			const rawLine = lines[i];

			// Multi-line comment tracking
			if (inMultilineComment) {
				if (rawLine.includes('*)')) {
					inMultilineComment = false;
					const afterClose = rawLine.substring(rawLine.indexOf('*)') + 2);
				const cleaned = removeComments(removeStringLiterals(afterClose));
				if (cleaned.trim()) { this.checkLineContent(cleaned, lineNumber, inVarBlock, declarations); }
				}
				continue;
			}

			if (rawLine.includes('(*') && !rawLine.includes('*)')) {
				inMultilineComment = true;
				const beforeComment = rawLine.substring(0, rawLine.indexOf('(*'));
				const cleaned = removeComments(removeStringLiterals(beforeComment));
				if (cleaned.trim()) { this.checkLineContent(cleaned, lineNumber, inVarBlock, declarations); }
				continue;
			}
			const trimmedRaw = rawLine.trim();
			if (trimmedRaw.startsWith('//')) { continue; }
			if (trimmedRaw.startsWith('(*') && trimmedRaw.includes('*)')) { continue; }

			const cleaned = removeComments(removeStringLiterals(rawLine));
			if (!cleaned.trim()) { continue; }

			// Track VAR blocks
			const upperClean = cleaned.trim().toUpperCase();
			if (/^VAR(_INPUT|_OUTPUT|_IN_OUT|_GLOBAL|_EXTERNAL|_TEMP|_STAT)?(\s|$)/i.test(upperClean)) {
				inVarBlock = true;
			}
			if (/^END_VAR(\s*;|\s*$)/i.test(upperClean)) {
				inVarBlock = false;
			}

			this.checkLineContent(cleaned, lineNumber, inVarBlock, declarations);
		}

		// ── Pass 2: block structure matching ─────────────────────
		this.checkBlockStructure(lines);

		return this.issues;
	}

	// ────────────────────────────────────────────────────────────
	//  Line-level dispatcher
	// ────────────────────────────────────────────────────────────

	private checkLineContent(line: string, lineNumber: number, inVarBlock: boolean, declarations: Record<string,string>): void {
		const trimmed = line.trim();
		if (!trimmed) { return; }

		this.checkArraySyntax(trimmed, lineNumber);
		this.checkArrayAccessSyntax(trimmed, lineNumber);
		this.checkRealLiterals(trimmed, lineNumber);
		this.checkVariableDeclarations(trimmed, lineNumber, inVarBlock, declarations);
		this.checkLiteralRanges(trimmed, lineNumber);
		this.checkControlStructures(trimmed, lineNumber);
		this.checkLoopSyntax(trimmed, lineNumber);
		this.checkCaseSyntax(trimmed, lineNumber);
		this.checkAssignments(trimmed, lineNumber);
		this.checkMissingSemicolons(trimmed, lineNumber);
		this.checkFunctionBlockUsage(trimmed, lineNumber, declarations);
	}

	// ────────────────────────────────────────────────────────────
	//  Individual checks
	// ────────────────────────────────────────────────────────────

	private parseArrayType(typeStr: string): { baseType: string; dimensions: string[][] } | undefined {
		let remaining = typeStr.trim();
		const dimensions: string[][] = [];
		const arrayRegex = /^ARRAY\s*\[([^\]]+)\]\s*OF\s*(.*)$/i;
		while (true) {
			const match = remaining.match(arrayRegex);
			if (!match) {
				return undefined;
			}
			const rawDims = match[1].trim();
			const dims = rawDims.split(',').map(d => d.trim()).filter(Boolean);
			if (!dims.length) {
				return undefined;
			}
			dimensions.push(dims);
			remaining = match[2].trim();
			if (!/^ARRAY\s*\[/.test(remaining)) {
				break;
			}
		}
		return { baseType: remaining.toUpperCase(), dimensions };
	}

	/** ARRAY[...] OF type — bounds and type validation */
	private checkArraySyntax(line: string, lineNumber: number): void {
		const arrayExpr = /\bARRAY\s*\[[^\]]+\]\s*OF\s*(?:ARRAY\s*\[[^\]]+\]\s*OF\s*)*[\w\d_]+/gi;
		let match: RegExpExecArray | null;
		while ((match = arrayExpr.exec(line)) !== null) {
			const typeExpr = match[0];
			const parsed = this.parseArrayType(typeExpr);
			if (!parsed) {
				this.addIssue(lineNumber, `Invalid ARRAY declaration syntax in '${typeExpr}'`, 'error');
				continue;
			}
			const { baseType, dimensions } = parsed;
			if (!ALL_KNOWN_TYPES.has(baseType) && baseType !== 'ARRAY') {
				this.addIssue(lineNumber,
					`Array element type '${baseType}' is not a recognised IEC/CODESYS standard type — verify it is declared`,
					'warning');
			}
			if (baseType === 'BIT') {
				this.addIssue(lineNumber,
					'Array element type BIT is invalid in CODESYS array declarations',
					'error');
			}
			for (const dimList of dimensions) {
				for (const dim of dimList) {
					const rangeMatch = dim.match(/^(-?\d+)\s*\.\.\s*(-?\d+)$/);
					if (rangeMatch) {
						const start = Number(rangeMatch[1]);
						const end = Number(rangeMatch[2]);
						if (start > end) {
							this.addIssue(lineNumber,
								`Array bounds invalid: start index (${start}) > end index (${end}) in '${typeExpr}'`,
								'error');
						}
						if (Math.abs(start) > 2147483647 || Math.abs(end) > 2147483647) {
							this.addIssue(lineNumber,
								`Array index limit must fit in DINT range [-2147483648..2147483647] in '${typeExpr}'`,
								'error');
						}
						continue;
					}
					const intMatch = dim.match(/^(-?\d+)$/);
					if (intMatch) {
						const value = Number(intMatch[1]);
						if (Math.abs(value) > 2147483647) {
							this.addIssue(lineNumber,
								`Array index limit must fit in DINT range [-2147483648..2147483647] in '${typeExpr}'`,
								'error');
						}
						continue;
					}
					this.addIssue(lineNumber,
						`Array dimension '${dim}' is not valid; expected integer or range (example: 1..10)`,
						'error');
				}
			}
		}
	}

	/** REAL / LREAL literal should include a decimal point */
	private checkArrayAccessSyntax(line: string, lineNumber: number): void {
		const accessExpr = /([\w\d_]+(?:\.[\w\d_]+)*)\s*(?:\[[^\]]+\])+(?!\s*OF\b)/g;
		let match: RegExpExecArray | null;
		while ((match = accessExpr.exec(line)) !== null) {
			const fullExpr = match[0];
			const indexGroups = fullExpr.match(/\[[^\]]*\]/g) || [];
			for (const rawIndex of indexGroups) {
				const content = rawIndex.slice(1, -1).trim();
				if (!content) {
					this.addIssue(lineNumber, `Array access '${fullExpr}' uses an empty index expression`, 'error');
					continue;
				}
				if (content.includes('..')) {
					this.addIssue(lineNumber, `Array access '${fullExpr}' must use index expressions, not ranges`, 'error');
					continue;
				}
				const indexes = content.split(',').map(i => i.trim());
				if (indexes.some(i => i.length === 0)) {
					this.addIssue(lineNumber, `Array access '${fullExpr}' contains an empty index segment`, 'error');
				}
			}
		}
	}

	private checkRealLiterals(line: string, lineNumber: number): void {
		const m = line.match(/:\s*(LREAL|REAL)\s*:=\s*(\d+)\b/i);
		if (m && !m[2].includes('.')) {
			this.addIssue(lineNumber,
				`${m[1].toUpperCase()} literal '${m[2]}' should include a decimal point (e.g. ${m[2]}.0)`,
				'warning');
		}
	}

	/** VAR CONSTANT must have an initialiser and types are recognised */
	private checkVariableDeclarations(line: string, lineNumber: number, inVarBlock: boolean, declarations: Record<string,string>): void {
		if (/\bCONSTANT\b/i.test(line) && line.includes(':') && !line.includes(':=')) {
			this.addIssue(lineNumber, 'Constant variable must have an initialiser (:=)', 'error');
		}

		const trimmed = line.trim();
		const declaration = trimmed.match(/^([\w\d_]+)\s*:\s*((?:ARRAY\s*\[[^\]]+\]\s*OF\s*)*[A-Z0-9_]+(?:\.[A-Z0-9_]+)*)\b/i);
		if (declaration) {
			const varName = declaration[1].toUpperCase();
			const varTypeRaw = declaration[2].toUpperCase().replace(/\s+/g, ' ');
			if (varTypeRaw.startsWith('ARRAY') && !this.parseArrayType(varTypeRaw)) {
				this.addIssue(lineNumber, `Invalid ARRAY declaration syntax in '${varTypeRaw}'`, 'error');
			}
			const varType = varTypeRaw.startsWith('ARRAY') ? varTypeRaw : varTypeRaw.split('.').pop() || varTypeRaw;
			if (!ALL_KNOWN_TYPES.has(varType) && !varType.startsWith('ARRAY')) {
				this.addIssue(lineNumber,
					`Variable '${declaration[1]}' uses unknown or unsupported type '${declaration[2]}'. Use a CODESYS IEC type or declare it before use.`,
					'warning');
			}
			declarations[varName] = varType;
		}
		// Inside VAR block: a token followed immediately by ; without a : is missing its type
		if (inVarBlock && /^\w[\w\d_]*\s*;/.test(trimmed)) {
			this.addIssue(lineNumber, 'Variable declaration appears to be missing a type annotation (example: myVar : INT;)', 'warning');
		}
	}

	private inferExpressionType(expression: string, declarations: Record<string,string>): string | undefined {
		const cleaned = expression.trim().replace(/^\(|\)$/g, '').trim();
		if (/^T#\d+(?:\.\d+)?(?:MS|S|M|H|D|Y)$/i.test(cleaned)) {
			return 'TIME';
		}
		if (/^(TRUE|FALSE)$/i.test(cleaned)) {
			return 'BOOL';
		}
		if (/^'.*'$/s.test(cleaned)) {
			return 'STRING';
		}
		const numeric = cleaned.replace(/\s/g, '');
		if (/^[+-]?\d+\.\d+([eE][+-]?\d+)?$/.test(numeric)) {
			return 'REAL';
		}
		if (/^[+-]?\d+$/.test(numeric)) {
			return undefined; // integer literal could match many integer types
		}
		const symbol = cleaned.toUpperCase();
		if (declarations[symbol]) {
			return declarations[symbol];
		}
		return undefined;
	}

	
	private checkLiteralRanges(line: string, lineNumber: number): void {
		const invalidTimeLiterals: string[] = [];
		const timeMatches = line.match(/\bT#([^\s;,\)]+)/ig);
		if (timeMatches) {
			for (const match of timeMatches) {
				if (!/^T#\d+(?:\.\d+)?(?:ms|s|m|h|d|y)$/i.test(match)) {
					invalidTimeLiterals.push(match);
				}
			}
		}
		const missingHashMatches = line.match(/\bT\d+(?:\.\d+)?(?:ms|s|m|h|d|y)\b/ig);
		if (missingHashMatches) {
			invalidTimeLiterals.push(...missingHashMatches);
		}
		const missingTPrefixMatches = line.match(/(?<!T#|T)\b#\d+(?:\.\d+)?(?:ms|s|m|h|d|y)\b/ig);
		if (missingTPrefixMatches) {
			invalidTimeLiterals.push(...missingTPrefixMatches);
		}
		const bareUnitMatches = line.match(/(?<!T#|T)\b\d+(?:\.\d+)?(?:ms|s|m|h|d|y)\b/ig);
		if (bareUnitMatches) {
			invalidTimeLiterals.push(...bareUnitMatches);
		}
		const uniqueInvalids = Array.from(new Set(invalidTimeLiterals));
		if (uniqueInvalids.length) {
			this.addIssue(lineNumber,
				'TIME literal must use the form T#<value><unit> with unit ms, s, m, h, d or y (example: T#5s, T#100ms). Found: ' + uniqueInvalids.join(', '),
				'error');
		}
		const badTimes = line.match(/\bT#\d+(?:\.\d+)?\b(?!\s*(?:ms|s|m|h|d|y)\b)/ig);
		if (badTimes) {
			this.addIssue(lineNumber,'TIME literal must specify a unit after T# (example: T#5s, T#100ms)', 'error');
		}
		const m = line.match(/:\s*(USINT|UINT|UDINT|ULINT|SINT|INT|DINT|LINT|TIME)\s*:=\s*([^;]+)/i);
		if (!m) return;
		const typ=m[1].toUpperCase(); const val=m[2].trim();
		const ranges:any={USINT:[0,255],UINT:[0,65535],UDINT:[0,4294967295],SINT:[-128,127],INT:[-32768,32767],DINT:[-2147483648,2147483647]};
		if (typ==='TIME') {
			if (!/^T#\d+(?:\.\d+)?(?:MS|S|M|H|D|Y)$/i.test(val)) this.addIssue(lineNumber,'TIME literal must use the form T#<value><unit> for TIME assignments (example: T#5s, T#100ms)','error');
			return;
		}
		if (ranges[typ]) { const n=Number(val); if(!Number.isNaN(n) && (n<ranges[typ][0]||n>ranges[typ][1])) this.addIssue(lineNumber,`${typ} value ${n} out of range [${ranges[typ][0]}..${ranges[typ][1]}]`,'error'); }
	}
/** IF without THEN; ELSE/ELSIF with trailing semicolon */
	private checkControlStructures(line: string, lineNumber: number): void {
		const up = line.trim().toUpperCase();

		if (/^IF\s+.+/i.test(up) && !up.includes('THEN') && !up.includes('END_IF')) {
			// Only warn if the line looks complete (not a multi-line condition continuation)
			if (!up.endsWith('(') && !up.endsWith(',') &&
				!/\b(OR|AND|NOT|XOR)\s*$/.test(up)) {
				this.addIssue(lineNumber, 'IF condition should end with THEN keyword', 'warning');
			}
		}

		if (/^(ELSE|ELSIF)\s*;/i.test(up)) {
			this.addIssue(lineNumber, 'ELSE / ELSIF should not be followed by a semicolon', 'error');
		}
	}

	/** FOR, WHILE, REPEAT / UNTIL syntax */
	private checkLoopSyntax(line: string, lineNumber: number): void {
		const up = line.trim().toUpperCase();

		if (/^FOR\s+/i.test(up)) {
			if (!up.includes(':=')) {
				this.addIssue(lineNumber, 'FOR loop: loop variable must be initialised with := (e.g. FOR i := 0 TO 9 DO)', 'error');
			} else if (!up.includes(' TO ')) {
				this.addIssue(lineNumber, 'FOR loop: missing TO keyword (e.g. FOR i := 0 TO 9 DO)', 'error');
			}
			if (!/ DO(\s*$|;)/.test(up) && !up.endsWith('DO')) {
				this.addIssue(lineNumber, 'FOR loop header must end with DO', 'warning');
			}
		}

		if (/^WHILE\s+/i.test(up)) {
			if (!/ DO(\s*$|;)/.test(up) && !up.endsWith('DO')) {
				this.addIssue(lineNumber, 'WHILE loop header must end with DO', 'warning');
			}
		}

		if (/^UNTIL\s+/i.test(up) && !up.endsWith(';')) {
			this.addIssue(lineNumber, 'UNTIL condition should end with a semicolon', 'warning');
		}
	}

	/** CASE var OF */
	private checkCaseSyntax(line: string, lineNumber: number): void {
		const up = line.trim().toUpperCase();
		if (/^CASE\s+/i.test(up) && !up.includes(' OF') && !up.endsWith('OF')) {
			this.addIssue(lineNumber, 'CASE statement must include OF keyword (e.g. CASE myVar OF)', 'error');
		}
	}

	/** Detect bare = used instead of := for assignment */
	private checkAssignments(line: string, lineNumber: number): void {
		const up = line.trim().toUpperCase();
		// Skip condition lines where = is a comparison
		if (/^(IF|WHILE|ELSIF|UNTIL)\s/i.test(up)) { return; }
		// Detect = that is NOT part of :=, <=, >=, <>
		if (/(?<![:!<>])=(?![=>])/.test(line) && !line.includes(':=')) {
			this.addIssue(lineNumber, 'ST uses := for assignment, not = (e.g. myVar := 5;)', 'warning');
		}
	}

	/** Missing semicolon at end of statements */
	private checkMissingSemicolons(line: string, lineNumber: number): void {
		const trimmed = line.trim();
		if (!trimmed) { return; }
		const up = trimmed.toUpperCase();

		// Lines that legitimately have no semicolon
		for (const kw of BLOCK_KEYWORDS_NO_SEMI) {
			if (up === kw || up.startsWith(kw + ' ') || up.startsWith(kw + '\t')) { return; }
		}
		// CASE label like "0, 1, 2:" or "'A':"
		if (/^[\w\s,']+:\s*$/.test(trimmed)) { return; }
		// Continuation lines (end with operator or open paren)
		if (/\b(OR|AND|NOT|XOR|MOD)\s*$/.test(up) || trimmed.endsWith('(') || trimmed.endsWith(',')) { return; }

		const endsOk = trimmed.endsWith(';') ||
			/\bDO\s*$/.test(up) ||
			/\bTHEN\s*$/.test(up) ||
			/\bOF\s*$/.test(up) ||
			/\bELSE\s*$/.test(up);

		// Assignment
		if (trimmed.includes(':=') && !endsOk) {
			this.addIssue(lineNumber, 'Missing semicolon at end of assignment statement', 'warning');
			return;
		}

		// Function / FB call: word(...)
		if (!endsOk && /\w+\s*\(.*\)\s*$/.test(trimmed)) {
			this.addIssue(lineNumber, 'Missing semicolon at end of function / function block call', 'warning');
			return;
		}

		// END_IF, END_FOR, END_WHILE, END_REPEAT, END_CASE should end with ;
		if (/^END_(IF|FOR|WHILE|REPEAT|CASE)\s*$/.test(up)) {
			this.addIssue(lineNumber, `${trimmed} should end with a semicolon (${trimmed};)`, 'warning');
		}
	}

	/** Standard / Util function block call validation */
	private normalizeParamGroups(groups?: Array<string | string[]>): string[][] {
		if (!groups) { return []; }
		return groups.map(g => typeof g === 'string' ? [g] : g);
	}

	private flattenParamGroups(groups?: Array<string | string[]>): string[] {
		return this.normalizeParamGroups(groups).flat();
	}

	private checkFunctionBlockUsage(line: string, lineNumber: number, declarations: Record<string,string>): void {
		const inst = line.match(/^([\w\d_]+(?:\.[\w\d_]+)*)\s*\((.*)\)\s*;?$/);
		if (!inst) return;
		const callName = inst[1];
		const ruleName = this.getCanonicalRuleName(callName, declarations);
		const rule = this.ruleMap[ruleName];
		const params = inst[2].split(',').map(p => p.trim()).filter(Boolean);
		const seen: Record<string,{style:string; value:string}> = {};
		for (const p of params) {
			const m = p.match(/^([\w\d_]+)\s*(=>|:=)\s*(.+)$/);
			if (m) {
				seen[m[1].toUpperCase()] = { style: m[2], value: m[3].trim() };
			}
		}

		if (rule) {
			const inputGroups = this.normalizeParamGroups(rule.requiredInputs);
			const outputNames = this.flattenParamGroups(rule.requiredOutputs);
			const allowedParams = new Set(Object.keys(rule.typeHints || {}));

			for (const key of Object.keys(seen)) {
				if (!allowedParams.has(key)) {
					this.addIssue(lineNumber, `${ruleName}: unknown parameter '${key}'`, 'error');
					continue;
				}
				const entry = seen[key];
				if (rule.inputStyle && inputGroups.some(group => group.includes(key)) && entry.style !== rule.inputStyle) {
					this.addIssue(lineNumber, `${key} must use ${rule.inputStyle} (input parameter)`, 'error');
				}
				if (rule.outputStyle && outputNames.includes(key) && entry.style !== rule.outputStyle) {
					this.addIssue(lineNumber, `${key} must use ${rule.outputStyle} (output parameter)`, 'error');
				}
				const expectedType = rule.typeHints?.[key];
				if (expectedType) {
					const actualType = this.inferExpressionType(entry.value, declarations);
					if (actualType && !this.isTypeCompatible(expectedType, actualType)) {
						this.addIssue(lineNumber,
							`${ruleName}: parameter ${key} expects type ${expectedType} but inferred ${actualType}`,
							'warning');
					}
				}
			}
		}
	}

	private getCanonicalRuleName(callName: string, declarations: Record<string,string>): string {
		const fbName = callName.split('.').pop()?.toUpperCase() || '';
		if (this.ruleMap[fbName]) {
			return fbName;
		}
		const instanceType = declarations[fbName]?.toUpperCase() || '';
		if (instanceType && this.ruleMap[instanceType]) {
			return instanceType;
		}
		return fbName;
	}

	private isTypeCompatible(expectedType: string, actualType: string): boolean {
		const expectedBase = expectedType.toUpperCase().split(/\s|\(/)[0];
		const actualUpper = actualType.toUpperCase();
		return actualUpper === expectedType.toUpperCase() || actualUpper === expectedBase ||
			(expectedBase === 'ARRAY' && actualUpper.startsWith('ARRAY['));
	}

	public getParameterSuggestions(callName: string, declarations: Record<string,string>): CompletionParameter[] {
		const ruleName = this.getCanonicalRuleName(callName, declarations);
		const rule = this.ruleMap[ruleName];
		if (!rule) { return []; }

		const suggestions: CompletionParameter[] = [];
		const added = new Set<string>();
		if (rule.requiredInputs) {
			for (const group of this.normalizeParamGroups(rule.requiredInputs)) {
				for (const name of group) {
					if (!added.has(name)) {
						added.add(name);
						suggestions.push({
							label: name,
							insertText: `${name} := `,
							detail: `INPUT${rule.typeHints?.[name] ? ` ${rule.typeHints[name]}` : ''}`
						});
					}
				}
			}
		}
		if (rule.requiredOutputs) {
			for (const name of this.flattenParamGroups(rule.requiredOutputs)) {
				if (!added.has(name)) {
					added.add(name);
					suggestions.push({
						label: name,
						insertText: `${name} => `,
						detail: `OUTPUT${rule.typeHints?.[name] ? ` ${rule.typeHints[name]}` : ''}`
					});
				}
			}
		}
		return suggestions;
	}

	public extractVariableDeclarations(content: string): Record<string,string> {
		const declarations: Record<string,string> = {};
		const lines = content.split(/\r?\n/);
		let inMultilineComment = false;

		for (const rawLine of lines) {
			if (inMultilineComment) {
				if (rawLine.includes('*)')) {
					inMultilineComment = false;
					const afterClose = rawLine.substring(rawLine.indexOf('*)') + 2);
					const cleaned = removeComments(removeStringLiterals(afterClose));
					if (cleaned.trim()) {
						const match = cleaned.trim().match(/^([\w\d_]+)\s*:\s*((?:ARRAY\s*\[[^\]]+\]\s*OF\s*)*[A-Z0-9_]+(?:\.[A-Z0-9_]+)*)\b/i);
						if (match) {
							declarations[match[1].toUpperCase()] = match[2].toUpperCase().replace(/\s+/g, ' ');
						}
					}
				}
				continue;
			}
			if (rawLine.includes('(*') && !rawLine.includes('*)')) {
				inMultilineComment = true;
				const beforeComment = rawLine.substring(0, rawLine.indexOf('(*'));
				const cleaned = removeComments(removeStringLiterals(beforeComment));
				if (cleaned.trim()) {
					const match = cleaned.trim().match(/^([\w\d_]+)\s*:\s*((?:ARRAY\s*\[[^\]]+\]\s*OF\s*)*[A-Z0-9_]+(?:\.[A-Z0-9_]+)*)\b/i);
					if (match) {
						declarations[match[1].toUpperCase()] = match[2].toUpperCase().replace(/\s+/g, ' ');
					}
				}
				continue;
			}

			const cleaned = removeComments(removeStringLiterals(rawLine));
			if (!cleaned.trim()) { continue; }
			const match = cleaned.trim().match(/^([\w\d_]+)\s*:\s*((?:ARRAY\s*\[[^\]]+\]\s*OF\s*)*[A-Z0-9_]+(?:\.[A-Z0-9_]+)*)\b/i);
			if (match) {
				declarations[match[1].toUpperCase()] = match[2].toUpperCase().replace(/\s+/g, ' ');
			}
		}

		return declarations;
	}
	// ────────────────────────────────────────────────────────────
	//  Pass 2 — Block structure matching
	// ────────────────────────────────────────────────────────────

	private checkBlockStructure(lines: string[]): void {
		interface StackEntry { keyword: string; line: number; }
		const stack: StackEntry[] = [];
		let inMLC = false;

		for (let i = 0; i < lines.length; i++) {
			const lineNumber = i + 1;
			let raw = lines[i];

			if (inMLC) {
				if (raw.includes('*)')) { inMLC = false; }
				continue;
			}
			if (raw.includes('(*') && !raw.includes('*)')) {
				raw = raw.substring(0, raw.indexOf('(*'));
				inMLC = true;
			}

			const cleaned = removeComments(removeStringLiterals(raw)).trim().toUpperCase();
			if (!cleaned) { continue; }

			// Check openers (longest match first to handle VAR_INPUT before VAR)
			const sortedOpeners = Object.keys(BLOCK_OPENERS).sort((a, b) => b.length - a.length);
			let pushedOpener = false;
			for (const opener of sortedOpeners) {
				const rx = new RegExp(`^${opener.replace(/[_]/g, '_')}(\\s|$)`);
				if (rx.test(cleaned)) {
					stack.push({ keyword: opener, line: lineNumber });
					pushedOpener = true;
					break;
				}
			}
			if (pushedOpener) { continue; }

			// Check closers
			const closers = new Set(Object.values(BLOCK_OPENERS));
			for (const closer of closers) {
				if (new RegExp(`^${closer}(\\s*;|\\s*$)`).test(cleaned)) {
					// Find the expected opener for this closer
					const expectedOpeners = Object.keys(BLOCK_OPENERS).filter(k => BLOCK_OPENERS[k] === closer);

					if (stack.length === 0) {
						this.addIssue(lineNumber,
							`Unexpected ${closer} — no matching opener found`,
							'error');
					} else {
						const top = stack[stack.length - 1];
						const expectedCloser = BLOCK_OPENERS[top.keyword];
						if (expectedCloser !== closer) {
							this.addIssue(lineNumber,
								`${closer} does not match open block ${top.keyword} (line ${top.line}); expected ${expectedCloser}`,
								'error');
						} else {
							stack.pop();
						}
					}
					break;
				}
			}
		}

		// Unclosed blocks
		for (const entry of stack) {
			this.addIssue(entry.line,
				`'${entry.keyword}' opened on this line but never closed (expected ${BLOCK_OPENERS[entry.keyword]})`,
				'error');
		}
	}

	// ────────────────────────────────────────────────────────────
	//  Helper
	// ────────────────────────────────────────────────────────────

	private addIssue(line: number, message: string, severity: 'error' | 'warning'): void {
		this.issues.push({ line, message, severity });
	}
}


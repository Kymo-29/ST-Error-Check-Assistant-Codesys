/**
 * CODESYS ST IEC 61131-3 Validator
 * Validates Structured Text code for CODESYS 3.5.18 compatibility
 */

interface ValidationIssue {
	line: number;
	message: string;
	severity: 'error' | 'warning';
}

export class CodesysValidator {
	private issues: ValidationIssue[] = [];
	private inMultilineComment: boolean = false;

	validateDocument(content: string, fileName: string): ValidationIssue[] {
		this.issues = [];
		this.inMultilineComment = false;
		const lines = content.split('\n');

		lines.forEach((line, index) => {
			const lineNumber = index + 1;
			this.checkLine(line, lineNumber);
		});

		return this.issues;
	}

	private checkLine(line: string, lineNumber: number): void {
		// Track multi-line comments
		const hasCommentStart = line.includes('(*');
		const hasCommentEnd = line.includes('*)');

		if (this.inMultilineComment) {
			// We're inside a multi-line comment
			if (hasCommentEnd) {
				this.inMultilineComment = false;
			}
			// Skip all validation for lines inside multi-line comments
			return;
		}

		if (hasCommentStart && !hasCommentEnd) {
			// Starting a multi-line comment
			this.inMultilineComment = true;
		}

		// Skip empty lines
		const trimmedLine = line.trim();
		if (!trimmedLine) {
			return;
		}

		// Skip lines that are purely single-line comments
		if (trimmedLine.startsWith('//')) {
			return;
		}

		// Remove inline comments for checking
		const cleanedLine = this.removeComments(line);
		
		// Skip if nothing left after removing comments
		if (!cleanedLine.trim()) {
			return;
		}

		// Check for syntax issues
		this.checkArraySyntax(cleanedLine, lineNumber);
		this.checkDataTypes(cleanedLine, lineNumber);
		this.checkVariableDeclarations(cleanedLine, lineNumber);
		this.checkControlStructures(cleanedLine, lineNumber);
		this.checkAssignments(cleanedLine, lineNumber);
		this.checkMissingSemicolons(cleanedLine, lineNumber);
	}

	private removeComments(line: string): string {
		// Remove single-line comments (//)
		let result = line;
		const singleLineIndex = result.indexOf('//');
		if (singleLineIndex !== -1) {
			result = result.substring(0, singleLineIndex);
		}

		// For multi-line comments on a single line (* ... *)
		const commentStart = result.indexOf('(*');
		const commentEnd = result.indexOf('*)');
		if (commentStart !== -1 && commentEnd !== -1 && commentEnd > commentStart) {
			// Both start and end on same line - remove the comment block
			result = result.substring(0, commentStart) + result.substring(commentEnd + 2);
		}
		
		return result;
	}

	private checkArraySyntax(line: string, lineNumber: number): void {
		// Check for invalid array initialization syntax
		const arrayInit = /ARRAY\s*\[\s*(\d+)\s*\.\.\s*(\d+)\s*\]\s*OF\s*(\w+)/i;
		const match = line.match(arrayInit);
		
		if (match) {
			const start = parseInt(match[1]);
			const end = parseInt(match[2]);
			
			if (start > end) {
				this.addIssue(lineNumber, 'Array bounds invalid: start index greater than end index', 'error');
			}
		}
	}

	private checkDataTypes(line: string, lineNumber: number): void {
		// Skip lines with single-line comments
		if (line.includes('//')) {
			return;
		}

		// Only check for obvious type issues
		const invalidReal = /:\s*REAL\s*:=\s*(\d+)([^\.0-9]|$)/;
		if (invalidReal.test(line) && !line.includes('.')) {
			this.addIssue(lineNumber, 'REAL literal should have decimal point (e.g., 42.0)', 'warning');
		}
	}

	private checkVariableDeclarations(line: string, lineNumber: number): void {
		// Skip lines with single-line comments
		if (line.includes('//')) {
			return;
		}

		// Only check for VAR CONSTANT without initializer (most obvious error)
		if (line.includes('VAR CONSTANT') && !line.includes(':=') && line.includes(':')) {
			this.addIssue(lineNumber, 'CONSTANT must have an initializer (:=)', 'error');
		}
	}

	private checkControlStructures(line: string, lineNumber: number): void {
		// Skip lines with single-line comments
		if (line.includes('//')) {
			return;
		}

		// Check IF without THEN only if it looks like a complete statement
		const ifMatch = /^\s*IF\s+.+\s*$/i.test(line);
		if (ifMatch && !line.includes('THEN')) {
			this.addIssue(lineNumber, 'IF statement should include THEN keyword', 'warning');
		}

		// Check FOR loop syntax - only if it looks like a FOR statement
		const forMatch = /^\s*FOR\s+.+/i.test(line);
		if (forMatch && !line.includes('DO')) {
			this.addIssue(lineNumber, 'FOR loop should include DO keyword', 'warning');
		}

		// Check WHILE loop syntax - only if it looks like a WHILE statement
		const whileMatch = /^\s*WHILE\s+.+/i.test(line);
		if (whileMatch && !line.includes('DO')) {
			this.addIssue(lineNumber, 'WHILE loop should include DO keyword', 'warning');
		}
	}

	private checkAssignments(line: string, lineNumber: number): void {
		// Skip lines with comments or strings
		if (line.includes('//') || line.includes("'")) {
			return;
		}

		// Check for invalid assignment operator = instead of := in actual code
		const assignmentMatch = /\w+\s*=\s*[^=><]/;
		if (assignmentMatch.test(line) && !line.includes(':=') && !line.includes('<=') && !line.includes('>=')) {
			// Only flag if it looks like an assignment, not comparison
			if (!line.includes('IF') && !line.includes('WHILE') && !line.includes('ELSIF')) {
				this.addIssue(lineNumber, 'ST uses := for assignment, not =', 'warning');
			}
		}
	}

	private checkMissingSemicolons(line: string, lineNumber: number): void {
		// Skip empty lines and comments
		const trimmedLine = line.trim();
		if (!trimmedLine || trimmedLine.startsWith('//')) {
			return;
		}

		// Skip lines that are just keywords or control structures
		if (/^(VAR|END_VAR|PROGRAM|END_PROGRAM|FUNCTION|END_FUNCTION|IF|THEN|ELSE|ELSIF|FOR|DO|WHILE|END_IF|END_FOR|END_WHILE|REPEAT|UNTIL)\s*$/i.test(trimmedLine)) {
			return;
		}

		// Check for missing semicolon on assignment statements
		const hasAssignment = /\w+\s*:=\s*[^;]*$/.test(trimmedLine);
		if (hasAssignment && !trimmedLine.endsWith(';') && !trimmedLine.endsWith('DO')) {
			this.addIssue(lineNumber, 'Missing semicolon at end of statement', 'warning');
			return;
		}

		// Check for missing semicolon on control structure closers
		const isCloser = /^(END_IF|END_FOR|END_WHILE|END_PROGRAM|END_FUNCTION)/.test(trimmedLine);
		if (isCloser && !trimmedLine.endsWith(';')) {
			this.addIssue(lineNumber, 'Missing semicolon at end of statement', 'warning');
			return;
		}

		// Check for missing semicolon on function calls
		const isFunctionCall = /\w+\s*\(.*\)\s*$/.test(trimmedLine);
		if (isFunctionCall && !trimmedLine.endsWith(';')) {
			this.addIssue(lineNumber, 'Missing semicolon at end of function call', 'warning');
		}
	}

	private addIssue(line: number, message: string, severity: 'error' | 'warning'): void {
		this.issues.push({ line, message, severity });
	}
}

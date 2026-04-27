import * as vscode from 'vscode';
import { CodesysValidator } from './validator';

let validator: CodesysValidator;
let diagnosticCollection: vscode.DiagnosticCollection;
let suggestTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
	console.log('CODESYS Validator extension is now active');

	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	validator = new CodesysValidator(workspaceRoot);
	diagnosticCollection = vscode.languages.createDiagnosticCollection('codesys-validator');
	context.subscriptions.push(diagnosticCollection);

	// Register command: Validate current file
	const validateCommand = vscode.commands.registerCommand('codesys-validator.validate', async () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			await validateFile(editor.document);
		}
	});

	// Register command: Validate all ST files
	const validateAllCommand = vscode.commands.registerCommand('codesys-validator.validateAll', async () => {
		await validateAllFiles();
	});

	// Register on-save validation
	const saveWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
		const config = vscode.workspace.getConfiguration('codesysValidator');
		if (config.get('enableOnSave', true) && document.languageId === 'st') {
			await validateFile(document);
		}
	});

	const suggestionWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
		if (event.document.languageId !== 'st') { return; }
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.uri.toString() !== event.document.uri.toString()) { return; }
		const position = editor.selection.active;
		if (!isPositionInFBCall(editor.document, position)) { return; }
		if (suggestTimer) { clearTimeout(suggestTimer); }
		suggestTimer = setTimeout(() => {
			const currentEditor = vscode.window.activeTextEditor;
			if (!currentEditor || currentEditor.document.uri.toString() !== event.document.uri.toString()) { return; }
			if (isPositionInFBCall(currentEditor.document, currentEditor.selection.active)) {
				void vscode.commands.executeCommand('editor.action.triggerSuggest');
			}
		}, 2000);
	});

	const completionProvider = vscode.languages.registerCompletionItemProvider('st', {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
			const linePrefix = document.lineAt(position.line).text.substring(0, position.character);
			if (!/\w+(?:\.[\w\d_]+)*\s*\($/.test(linePrefix)) {
				return null;
			}
			if (isPositionInVarBlock(document, position)) {
				return null;
			}

			const match = linePrefix.match(/([\w\d_]+(?:\.[\w\d_]+)*)\s*\($/);
			if (!match) { return null; }
			const callName = match[1];
			const declarations = validator.extractVariableDeclarations(document.getText());
			const suggestions = validator.getParameterSuggestions(callName, declarations);
			if (!suggestions.length) { return null; }

			return suggestions.map(s => {
				const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Property);
				item.insertText = new vscode.SnippetString(`${s.insertText}$1`);
				item.detail = s.detail;
				item.documentation = `Insert ${s.label} parameter for ${callName}`;
				return item;
			});
		}
	}, '(');

	context.subscriptions.push(validateCommand, validateAllCommand, saveWatcher, suggestionWatcher, completionProvider);

	vscode.window.showInformationMessage('CODESYS Validator loaded. Use Ctrl+Shift+K to validate.');
}

async function validateFile(document: vscode.TextDocument): Promise<void> {
	const fileName = document.uri.fsPath;
	const issues = validator.validateDocument(document.getText(), fileName);
	const diagnostics: vscode.Diagnostic[] = [];

	// Convert issues to diagnostics with highlighting
	issues.forEach(issue => {
		const line = issue.line - 1; // Convert to 0-based
		const range = new vscode.Range(line, 0, line, 500); // Highlight entire line
		
		const severity = issue.severity === 'error' 
			? vscode.DiagnosticSeverity.Error 
			: vscode.DiagnosticSeverity.Warning;
		
		const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
		diagnostic.source = 'CODESYS Validator';
		diagnostics.push(diagnostic);
	});

	// Update diagnostics in editor
	diagnosticCollection.set(document.uri, diagnostics);

	if (issues.length === 0) {
		vscode.window.showInformationMessage(`✓ ${fileName}: No issues found!`);
	} else {
		const message = `Found ${issues.length} issue(s) in ${document.fileName}`;
		const detail = issues.map(i => `• Line ${i.line}: ${i.message}`).join('\n');
		
		const config = vscode.workspace.getConfiguration('codesysValidator');
		if (config.get('showDetailedMessages', true)) {
			await vscode.window.showWarningMessage(message, { detail, modal: false });
		} else {
			await vscode.window.showWarningMessage(message);
		}
	}
}

async function validateAllFiles(): Promise<void> {
	const files = await vscode.workspace.findFiles('**/*.st');
	
	if (files.length === 0) {
		vscode.window.showInformationMessage('No ST files found in workspace.');
		return;
	}

	let totalIssues = 0;
	const fileIssues: Map<string, number> = new Map();

	for (const file of files) {
		const document = await vscode.workspace.openTextDocument(file);
		const issues = validator.validateDocument(document.getText(), file.fsPath);
		totalIssues += issues.length;
		if (issues.length > 0) {
			fileIssues.set(file.fsPath, issues.length);
		}
	}

	if (totalIssues === 0) {
		vscode.window.showInformationMessage(`✓ All ${files.length} ST files validated successfully!`);
	} else {
		let detail = `Files with issues:\n`;
		fileIssues.forEach((count, file) => {
			detail += `• ${file}: ${count} issue(s)\n`;
		});
		await vscode.window.showWarningMessage(
			`Validation complete: ${totalIssues} issue(s) found in ${fileIssues.size} file(s)`,
			{ detail, modal: false }
		);
	}
}

function isPositionInVarBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
	let inVarBlock = false;
	for (let i = 0; i <= position.line; i++) {
		const rawLine = document.lineAt(i).text;
		const trimmed = rawLine.trim().toUpperCase();
		if (/^VAR(_INPUT|_OUTPUT|_IN_OUT|_GLOBAL|_EXTERNAL|_TEMP|_STAT)?(\s|$)/.test(trimmed)) {
			inVarBlock = true;
		}
		if (/^END_VAR(\s*;|\s*$)/.test(trimmed)) {
			inVarBlock = false;
		}
	}
	return inVarBlock;
}

function isPositionInFBCall(document: vscode.TextDocument, position: vscode.Position): boolean {
	if (isPositionInVarBlock(document, position)) { return false; }
	const lineText = document.lineAt(position.line).text;
	const prefix = lineText.substring(0, position.character);
	const callMatch = prefix.match(/([\w\d_]+(?:\.[\w\d_]+)*)\s*\([^)]*$/);
	return !!callMatch;
}

export function deactivate() {}

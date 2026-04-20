import * as vscode from 'vscode';
import { CodesysValidator } from './validator';

let validator: CodesysValidator;
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
	console.log('CODESYS Validator extension is now active');

	validator = new CodesysValidator();
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

	context.subscriptions.push(validateCommand, validateAllCommand, saveWatcher);

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

export function deactivate() {}

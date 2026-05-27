export interface PromptDefinition {
  id: string;
  title: string;
  sourcePath: string;
  docsPath: string;
  runtimePath: string;
  runtimeExportName: string;
  purpose: string[];
  designPrinciples: Array<{ title: string; body: string }>;
  promptSections: Array<{
    heading: string;
    language: string;
    content: string;
    commentaryTitle: string;
    commentary: string;
  }>;
  contextPacket: {
    description: string;
    template: string;
    commentaryTitle: string;
    commentary: string;
  };
  iterationLog: Array<{
    date: string;
    change: string;
    reason: string;
  }>;
}

export interface PromptArtifactOptions {
  root?: string;
}

export function loadPromptDefinitions(directory?: string): Promise<PromptDefinition[]>;
export function buildFullPrompt(definition: PromptDefinition): string;
export function renderPromptDocs(definition: PromptDefinition): string;
export function renderRuntimePrompt(definition: PromptDefinition): string;
export function generatePromptArtifacts(options?: PromptArtifactOptions): Promise<
  Array<{
    id: string;
    docsChanged: boolean;
    runtimeChanged: boolean;
    docsPath: string;
    runtimePath: string;
  }>
>;
export function checkPromptArtifacts(options?: PromptArtifactOptions): Promise<string[]>;

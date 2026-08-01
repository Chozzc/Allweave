// Markdown files import as raw strings (asset/source rule in next.config.ts).
declare module "*.md" {
    const content: string;
    export default content;
}

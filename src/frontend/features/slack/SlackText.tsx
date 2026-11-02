import { type Block, type Inline, parseBlocks, parseInline } from "./mrkdwn";

// A Slack message drawn in Slack's text format: quotes, code blocks, bold, italic, strike, code, links, and mentions. Everything is built as
// elements, never as HTML, so a message cannot add markup of its own.
export function SlackText({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 break-words">
      {parseBlocks(text).map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap">
          <InlineView nodes={parseInline(block.text)} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="whitespace-pre-wrap border-l-2 border-current/40 pl-2 opacity-80">
          <InlineView nodes={parseInline(block.text)} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-box bg-base-content/10 p-2 text-xs">
          <code className="font-mono">{block.text}</code>
        </pre>
      );
  }
}

function InlineView({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineNode key={i} node={node} />
      ))}
    </>
  );
}

function InlineNode({ node }: { node: Inline }) {
  if (typeof node === "string") return <>{node}</>;
  switch (node.kind) {
    case "code":
      return <code className="rounded bg-base-content/10 px-1 font-mono text-[0.9em]">{node.text}</code>;
    case "bold":
      return (
        <strong>
          <InlineView nodes={node.children} />
        </strong>
      );
    case "italic":
      return (
        <em>
          <InlineView nodes={node.children} />
        </em>
      );
    case "strike":
      return (
        <s>
          <InlineView nodes={node.children} />
        </s>
      );
    case "link":
      return (
        <a className="link" href={node.href} target="_blank" rel="noopener noreferrer">
          <InlineView nodes={node.children} />
        </a>
      );
    case "mention":
      return <span className="rounded bg-primary/15 px-1 font-medium">{node.text}</span>;
  }
}

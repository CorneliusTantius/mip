import { Fragment, type ComponentChildren } from "preact";
import { type Block, type Inline, parseBlocks, parseInline } from "./markdown";

// Draws each run of plain text. The default keeps it as it is; a room passes one that adds mention pills.
type RenderText = (text: string) => ComponentChildren;

const plainText: RenderText = (text) => text;

// A reply drawn as Markdown. Each run of plain text goes through `renderText`, so a caller can add pieces to it.
export function Markdown({ text, renderText = plainText }: { text: string; renderText?: RenderText }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 break-words">
      {parseBlocks(text).map((block, i) => (
        <BlockView key={i} block={block} renderText={renderText} />
      ))}
    </div>
  );
}

function BlockView({ block, renderText }: { block: Block; renderText: RenderText }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap">
          <InlineView nodes={parseInline(block.text)} renderText={renderText} />
        </p>
      );
    case "heading": {
      const size = block.level === 1 ? "text-lg font-bold" : block.level === 2 ? "text-base font-bold" : "font-semibold";
      return (
        <div className={size}>
          <InlineView nodes={parseInline(block.text)} renderText={renderText} />
        </div>
      );
    }
    case "code":
      return (
        <pre className="overflow-x-auto rounded-box bg-base-content/10 p-3 text-xs">
          <code className="font-mono">{block.text}</code>
        </pre>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag className={block.ordered ? "list-decimal pl-5" : "list-disc pl-5"}>
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineView nodes={parseInline(item)} renderText={renderText} />
            </li>
          ))}
        </ListTag>
      );
    }
    case "quote":
      return (
        <blockquote className="whitespace-pre-wrap border-l-2 border-current/40 pl-3 opacity-80">
          <InlineView nodes={parseInline(block.text)} renderText={renderText} />
        </blockquote>
      );
    case "rule":
      return <hr className="border-current/20" />;
  }
}

function InlineView({ nodes, renderText }: { nodes: Inline[]; renderText: RenderText }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (typeof node === "string") return <Fragment key={i}>{renderText(node)}</Fragment>;
        switch (node.kind) {
          case "code":
            return (
              <code key={i} className="rounded bg-base-content/10 px-1 font-mono text-[0.9em]">
                {node.text}
              </code>
            );
          case "strong":
            return (
              <strong key={i}>
                <InlineView nodes={node.children} renderText={renderText} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <InlineView nodes={node.children} renderText={renderText} />
              </em>
            );
          case "link":
            return (
              <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" className="link break-all">
                <InlineView nodes={node.children} renderText={renderText} />
              </a>
            );
        }
      })}
    </>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs — t2000",
  description:
    "CLI commands, SDK reference, agent skills, and guides for the t2000 financial stack on Sui.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

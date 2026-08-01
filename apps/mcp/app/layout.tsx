export const metadata = {
  title: "t2000 Passport Connect",
  description: "Hosted MCP for the t2000 A2A store.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

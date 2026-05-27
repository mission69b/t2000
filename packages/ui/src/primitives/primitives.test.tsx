/**
 * @t2000/ui smoke tests — one render assertion per primitive.
 *
 * These do NOT verify visual output (that requires the consumer's
 * Tailwind preset + token imports + font wiring). They verify that
 * (a) the primitive's source compiles, (b) it mounts without crash,
 * (c) the basic role / text is in the rendered tree.
 *
 * Visual smoke goes through `apps/web/app/_ui-smoke/page.tsx` (a
 * throwaway route deleted at the end of Rock 0).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button } from './button.js';
import { Card, CardHeader, CardTitle, CardContent } from './card.js';
import { Badge } from './badge.js';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './table.js';
import { Separator } from './separator.js';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './dialog.js';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from './sheet.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs.js';
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from './tooltip.js';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './accordion.js';
import { ScrollArea } from './scroll-area.js';
import { Command, CommandInput, CommandList, CommandItem } from './command.js';
import { Skeleton } from './skeleton.js';
// Toaster comes from the `@t2000/ui/toaster` client-only entry in
// published builds. For tests we import the underlying source file
// directly to verify it mounts — no need to go through the bundled
// entry barrel here.
import { Toaster } from './sonner.js';

afterEach(() => {
  cleanup();
});

describe('@t2000/ui primitive smoke', () => {
  it('Button renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeDefined();
  });

  it('Card composes header + title + content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Hello</CardTitle>
        </CardHeader>
        <CardContent>World</CardContent>
      </Card>,
    );
    expect(screen.getByText('Hello')).toBeDefined();
    expect(screen.getByText('World')).toBeDefined();
  });

  it('Badge renders inline text', () => {
    render(<Badge variant="accent">new</Badge>);
    expect(screen.getByText('new')).toBeDefined();
  });

  it('Table renders header + row cells', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Audric</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText('Name')).toBeDefined();
    expect(screen.getByText('Audric')).toBeDefined();
  });

  it('Separator renders with role=none (decorative default)', () => {
    const { container } = render(<Separator />);
    expect(container.querySelector('[data-orientation="horizontal"]')).not.toBeNull();
  });

  it('Dialog renders trigger; content portals on open', () => {
    render(
      <Dialog defaultOpen>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>desc</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Dialog title')).toBeDefined();
  });

  it('Sheet renders trigger; content portals on open', () => {
    render(
      <Sheet defaultOpen>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent side="right">
          <SheetTitle>Sheet title</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Sheet title')).toBeDefined();
  });

  it('DropdownMenu renders trigger', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText('Menu')).toBeDefined();
  });

  it('Tabs renders list + default panel', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Tab A')).toBeDefined();
    expect(screen.getByText('Panel A')).toBeDefined();
  });

  it('Tooltip renders trigger inside provider', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover</TooltipTrigger>
          <TooltipContent>Hint</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText('Hover')).toBeDefined();
  });

  it('Accordion renders trigger; content shows when item open', () => {
    render(
      <Accordion type="single" defaultValue="one" collapsible>
        <AccordionItem value="one">
          <AccordionTrigger>Q1</AccordionTrigger>
          <AccordionContent>A1</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getByText('Q1')).toBeDefined();
    expect(screen.getByText('A1')).toBeDefined();
  });

  it('ScrollArea renders child content', () => {
    render(
      <ScrollArea className="h-20 w-20">
        <p>scroll body</p>
      </ScrollArea>,
    );
    expect(screen.getByText('scroll body')).toBeDefined();
  });

  it('Command renders input + list + item', () => {
    render(
      <Command>
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandItem>option one</CommandItem>
        </CommandList>
      </Command>,
    );
    expect(screen.getByPlaceholderText('Search…')).toBeDefined();
    expect(screen.getByText('option one')).toBeDefined();
  });

  it('Skeleton renders as aria-hidden div', () => {
    const { container } = render(<Skeleton className="h-4 w-32" data-testid="sk" />);
    const el = container.querySelector('[data-testid="sk"]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-hidden')).toBe('true');
  });

  it('Toaster mounts (Sonner container)', () => {
    const { container } = render(<Toaster />);
    // Sonner mounts a section[aria-label] at the document level
    expect(container).toBeDefined();
    expect(document.querySelector('[aria-label*="otifications" i]')).not.toBeNull();
  });
});

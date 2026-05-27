export { cn } from './lib/cn.js';

export { Button, buttonVariants, type ButtonProps } from './primitives/button.js';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './primitives/card.js';
export { Badge, badgeVariants, type BadgeProps } from './primitives/badge.js';
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './primitives/table.js';
export { Separator } from './primitives/separator.js';
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './primitives/dialog.js';
export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './primitives/sheet.js';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './primitives/dropdown-menu.js';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './primitives/tabs.js';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './primitives/tooltip.js';
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './primitives/accordion.js';
export { ScrollArea, ScrollBar } from './primitives/scroll-area.js';
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from './primitives/command.js';
export { Skeleton } from './primitives/skeleton.js';

// Toaster + toast intentionally NOT exported from the main barrel.
// They live in `@t2000/ui/toaster` so the `'use client'` directive at
// the top of `src/toaster.ts` reaches the consumer bundle intact —
// Sonner uses client-only React hooks that would crash in a server
// component. See `src/toaster.ts` for the consumer pattern.

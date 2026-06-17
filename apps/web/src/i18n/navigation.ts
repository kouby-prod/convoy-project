import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware drop-in replacements for next/link & next/navigation.
// Import Link/redirect/usePathname/useRouter from here, NOT from 'next/*'.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

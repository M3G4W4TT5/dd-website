/// <reference types="astro/client" />
declare namespace App {
  interface Locals {preview?: {token: string; studioUrl: string; perspective: "drafts" | "published"};}
}

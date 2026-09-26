import { NotFoundExperience } from "@/components/NotFoundExperience";
import { pageLanguage } from "@/lib/language";

export default async function NotFound() {
  return <NotFoundExperience initialLanguage={await pageLanguage()} />;
}

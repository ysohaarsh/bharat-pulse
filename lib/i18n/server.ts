import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE } from "./display";
import { isUiLang, type UiLang } from "./languages";

/** The viewer's UI language from the `lang` cookie (default English). */
export async function getLang(): Promise<UiLang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isUiLang(value) ? value : "en";
}

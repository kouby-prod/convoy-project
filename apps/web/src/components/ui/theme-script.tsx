/** Inline script: apply stored theme before paint to avoid a light flash. */
export function ThemeScript() {
  const code = `try{var t=localStorage.getItem('convoy-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

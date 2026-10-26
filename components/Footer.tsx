export default function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-200 px-4 py-4 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        Weather data by Open-Meteo.com
      </a>
    </footer>
  );
}

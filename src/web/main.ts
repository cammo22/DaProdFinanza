/**
 * Avvio della versione Android: prima il ponte (backend in pagina e
 * `window.daprod`), poi la stessa interfaccia del programma per computer.
 * L'ordine degli import è l'ordine di esecuzione.
 */
import './bridge'
import '../renderer/src/main'

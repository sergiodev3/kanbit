import type { ReactNode } from 'react';
import { CHECKIN_QUESTIONS } from '../meetings/meetings-model';

const BOARD_COLUMNS = [
  ['Backlog', 'Ideas y pendientes'],
  ['Por hacer', 'Lo de esta semana'],
  ['En marcha', 'Lo que estás haciendo'],
  ['Terminado', 'Listo y cumplido'],
] as const;

const WEEK = [
  ['Lunes', 'el moderador inicia el sprint y el equipo planea.'],
  ['Martes a jueves', 'trabajan y mueven sus tarjetas.'],
  ['Viernes', 'cierre: lo terminado sale del tablero y lo que falta regresa al Backlog.'],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-slate-200 pt-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

const list = 'list-disc space-y-1 pl-5';

/** Public student guide (no session needed), so the registration link can point students straight at it. */
export function HelpPage() {
  return (
    <article className="space-y-5 text-slate-800">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Ayuda</h1>
        <p className="text-slate-600">
          Tu equipo planea la semana en un tablero, se reporta cada día desde el celular y proyecta la reunión de 15
          minutos.
        </p>
      </header>

      <Section title="Entra por primera vez">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abre el enlace de registro que te dio tu docente.</li>
          <li>Escribe tu nombre, un usuario y una contraseña. Guárdalos.</li>
          <li>Entrarás a "Mi equipo". Si aún no ves equipo, tu docente todavía no te asignó a uno.</li>
        </ol>
        <p>
          Funciona en el navegador del celular o de la computadora del laboratorio, y necesitas internet para usarla.
          ¿Olvidaste tu contraseña? Pide una temporal a tu docente y cámbiala en "Perfil".
        </p>
      </Section>

      <Section title="El tablero">
        <p>Hay una fila por integrante y cuatro columnas:</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BOARD_COLUMNS.map(([name, hint]) => (
            <li key={name} className="rounded-lg bg-white p-2 text-sm ring-1 ring-slate-200">
              <b className="block">{name}</b>
              <span className="text-slate-600">{hint}</span>
            </li>
          ))}
        </ul>
        <p>
          La fila "Sin asignar" aparece primero. Usa "Solo mis tarjetas" para ver únicamente la tuya. El tablero se
          actualiza solo cada 10 segundos.
        </p>
      </Section>

      <Section title="Crea una tarjeta">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Toca "Nueva tarjeta". Siempre empieza en el Backlog, sin asignar.</li>
          <li>
            Para sacarla del Backlog necesita responsable, día estimado y criterio de terminado (cómo sabrás que quedó
            lista).
          </li>
          <li>Muévela a "Por hacer" cuando el moderador ya haya iniciado el sprint.</li>
        </ol>
      </Section>

      <Section title="Mueve tarjetas">
        <ul className={list}>
          <li>
            <b>Celular:</b> abre la tarjeta y usa "Mover a". También puedes mantenerla presionada un momento y
            arrastrarla.
          </li>
          <li>
            <b>Computadora:</b> arrastra la tarjeta con el mouse.
          </li>
          <li>Solo puedes mover tus propias tarjetas. El moderador puede mover todas.</li>
          <li>Si algo no se puede, la app te lo explica en pantalla.</li>
        </ul>
      </Section>

      <Section title="La validación del moderador">
        <p>
          Una tarjeta en "Por hacer" aparece como "Por validar" hasta que el moderador la revisa. Solo después puede
          pasar a "En marcha" y a "Terminado".
        </p>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Una tarjeta ya validada solo la edita el moderador. Si necesitas cambiarla, pídeselo.
        </p>
      </Section>

      <Section title="La semana de sprint">
        <ul className={list}>
          {WEEK.map(([day, text]) => (
            <li key={day}>
              <b>{day}:</b> {text}
            </li>
          ))}
          <li>Desde el miércoles verás un aviso con los días que quedan y cuántas tarjetas faltan.</li>
        </ul>
      </Section>

      <Section title="Tu reporte diario">
        <ol className="list-decimal space-y-1 pl-5">
          <li>En el tablero toca "Reunión de hoy".</li>
          <li>
            Responde las cuatro preguntas:
            <ul className="list-disc pl-5">
              {Object.values(CHECKIN_QUESTIONS).map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </li>
          <li>Guarda. Puedes enviarlo antes o durante la reunión y corregirlo después.</li>
        </ol>
        <p>
          El moderador abre la reunión y la proyecta con un cronómetro de 15 minutos. Tu reporte aparece en la pantalla
          en menos de 15 segundos.
        </p>
      </Section>

      <Section title="Si algo falla">
        <ul className={list}>
          <li>Recarga la página y revisa que tengas internet o datos.</li>
          <li>Si ves "Sin sprint abierto", el moderador aún no lo inicia.</li>
          <li>Si el problema sigue, díselo a tu docente con una captura de pantalla.</li>
        </ul>
      </Section>
    </article>
  );
}

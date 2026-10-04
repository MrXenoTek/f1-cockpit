import { C } from "../theme";
import { btn } from "../theme";
import Icon from "./Icon";
import { meetingLabel } from "../meetings";

// Shown when a selected session returns nothing, so an empty screen always has an explanation.
export default function DataNotice({ status, alternatives, onPick, onClose, lang = "fr" }) {
  const fr = lang === "fr";
  let title, body;
  if (status === 401 || status === 403) {
    title = fr ? "OpenF1 refuse l'accès" : "OpenF1 refused access";
    body = fr
      ? `Erreur HTTP ${status}. Pendant une session en direct, OpenF1 réserve ses données aux comptes authentifiés ; elles redeviennent publiques peu après la fin de la session. Réessayez plus tard.`
      : `HTTP ${status}. During a live session OpenF1 restricts its data to authenticated accounts; it becomes public again shortly after the session ends. Try again later.`;
  } else if (status === 429) {
    title = fr ? "Trop de requêtes" : "Too many requests";
    body = fr ? "OpenF1 limite le débit. Patientez quelques secondes puis rechargez la session." : "OpenF1 is rate-limiting. Wait a few seconds, then reload the session.";
  } else if (status === 0 || status >= 500) {
    title = fr ? "OpenF1 injoignable" : "OpenF1 unreachable";
    body = fr ? "Le service ne répond pas (réseau ou panne). Réessayez dans un instant." : "The service is not answering (network or outage). Try again shortly.";
  } else {
    title = fr ? "Aucune donnée pour cette session" : "No data for this session";
    body = fr
      ? "L'événement a peut-être été annulé ou déplacé (OpenF1 garde les sessions du calendrier initial), ou ses données ne sont pas encore publiées."
      : "The event may have been cancelled or moved (OpenF1 keeps the sessions of the original calendar), or its data is not published yet.";
  }
  return (
    <div role="alert" style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 20, background: C.bBg, border: `1px solid ${C.bLine}`, borderRadius: 12, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start", maxWidth: 640, margin: "0 auto" }}>
      <span style={{ color: C.b, marginTop: 2 }}><Icon name="flag" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: C.b, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>{body}</div>
        {alternatives.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 6 }}>{fr ? "Même événement, autre édition :" : "Same event, other edition:"}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {alternatives.map((m) => (
                <button key={m.meeting_key} onClick={() => onPick(m)} style={{ ...btn(), height: 34 }}>{meetingLabel(m, lang)}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <button onClick={onClose} aria-label={fr ? "Fermer" : "Close"} style={{ background: "transparent", border: "none", color: C.text2, padding: 4, display: "flex" }}><Icon name="close" /></button>
    </div>
  );
}

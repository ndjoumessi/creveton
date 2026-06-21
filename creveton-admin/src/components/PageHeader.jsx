/** En-tête de page : titre + description + zone d'actions à droite. */
export default function PageHeader({ title, description, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="row wrap" style={{ gap: 10 }}>{actions}</div>}
    </div>
  );
}

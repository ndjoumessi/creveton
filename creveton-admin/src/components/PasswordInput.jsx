import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Champ mot de passe avec bascule afficher/masquer (icône œil).
 * Compatible react-hook-form : transmettre `{...register('xxx')}` en props.
 */
const PasswordInput = forwardRef(function PasswordInput(
  { className = 'input', placeholder = '••••••••', ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pwd-wrap">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={className}
        placeholder={placeholder}
        {...props}
      />
      <button
        type="button"
        className="pwd-eye"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        title={visible ? 'Masquer' : 'Afficher'}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
});

export default PasswordInput;

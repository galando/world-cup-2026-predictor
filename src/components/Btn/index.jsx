import styles from './styles.module.css';

export default function Btn({ children, variant = 'primary', className = '', ...rest }) {
  return (
    <button className={`${styles.btn} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

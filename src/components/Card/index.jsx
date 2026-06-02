import styles from './styles.module.css';

export default function Card({ children, className = '', ...rest }) {
  return (
    <div className={`${styles.card} ${className}`} {...rest}>
      {children}
    </div>
  );
}

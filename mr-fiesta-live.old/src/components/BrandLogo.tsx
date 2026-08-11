export function BrandLogo({ className = '', alt = 'MR Fiesta' }: { className?: string; alt?: string }) {
  return <img className={`mrfiesta-logo ${className}`} src={`${import.meta.env.BASE_URL}mr-fiesta-logo.png`} alt={alt} />
}

interface SquareIconProps {
  className?: string;
}

export function ArmIcon({ className }: SquareIconProps) {
  return (
    <img
      src="/arm.svg" // files in public should be referenced from root
      alt="Arm icon"
      className={className}
    />
  );
}

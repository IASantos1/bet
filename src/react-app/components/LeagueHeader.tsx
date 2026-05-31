type Props = { name: string };
export default function LeagueHeader({ name }: Props) {
  return (
    <h2 className="league-header text-lg font-din bg-gray-100 p-1 mt-4">{name}</h2>
  );
}

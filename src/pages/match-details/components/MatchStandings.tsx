// src/pages/match-details/components/MatchStandings.tsx

import React from 'react';

interface StandingTeam {
    id: number;
    name: string;
    points: number;
    wins: number;
    losses: number;
}

interface MatchStandingsProps {
    standings: StandingTeam[];
}

const MatchStandings: React.FC<MatchStandingsProps> = ({ standings }) => {
    return (
        <div>
            <h2>Match Standings</h2>
            <table>
                <thead>
                    <tr>
                        <th>Team</th>
                        <th>Wins</th>
                        <th>Losses</th>
                        <th>Points</th>
                    </tr>
                </thead>
                <tbody>
                    {standings.map((team: StandingTeam) => (
                        <tr key={team.id}>
                            <td>{team.name}</td>
                            <td>{team.wins}</td>
                            <td>{team.losses}</td>
                            <td>{team.points}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default MatchStandings;
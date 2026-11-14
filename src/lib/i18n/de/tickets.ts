export default {
  errors: {
    not_found: "Dieses Ticket oder Projekt gibt es nicht (mehr).",
    invalid_status: "Dieser Status gehört nicht zum Projekt.",
    invalid_assignee: "Diese Person ist kein aktives Mitglied.",
    invalid_label: "Dieses Label gehört nicht zum Projekt.",
    project_archived: "Das Projekt ist archiviert.",
    invalid_parent: "Das übergeordnete Ticket gibt es in diesem Projekt nicht.",
    epic_no_parent: "Ein Epic kann keinem anderen Ticket untergeordnet werden.",
    subtask_needs_parent: "Eine Unteraufgabe braucht eine Story oder Aufgabe als übergeordnetes Ticket.",
    parent_must_be_epic: "Stories und Aufgaben lassen sich nur einem Epic unterordnen.",
    parent_must_be_story_or_task: "Unteraufgaben gehören unter eine Story oder Aufgabe.",
    epic_has_children: "Dieses Epic enthält noch Stories oder Aufgaben. Erst diese aus dem Epic lösen, dann den Typ ändern.",
    has_subtasks: "Dieses Ticket hat Unteraufgaben und kann deshalb nur Story oder Aufgabe sein.",
    checklist_needs_story_or_task: "Nur Stories und Aufgaben können Unteraufgaben haben.",
  },
} as const;

// Which component draws each kind of window, and its side ornament.
import { About, Files, FilesOrn, Project, ProjectOrn, Mail, Trash, Scenes, Sys, Secrets, Terminal, RadioApp } from './apps';
import { RadioAdminApp } from '../radio/admin/AdminWindow.jsx';

export const BODIES = { about: About, files: Files, project: Project, mail: Mail, trash: Trash, scenes: Scenes, sys: Sys, secrets: Secrets, terminal: Terminal, radio: RadioApp, radioadmin: RadioAdminApp };
export const ORNAMENTS = { files: FilesOrn, project: ProjectOrn };

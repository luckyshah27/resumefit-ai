/**
 * Canonical skill ontology used by every extraction and matching step.
 *
 * - `aliases` are matched case-insensitively with technology-aware word boundaries.
 * - `caseSensitiveAliases` are used for ambiguous short tokens (Go, R, C, REST, TS ...).
 * - `notFollowedBy` blocks known collisions (React -> React Native, Spring -> Spring Boot).
 * - `implies` lists skills a candidate necessarily works with when using this one.
 * - `RELATED_GROUPS` describe transferable (semantic) relationships. They can only ever
 *   produce a PARTIAL_MATCH in the matching engine - never a full match.
 */

export type SkillCategory =
  | 'language'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'cloud'
  | 'devops'
  | 'data'
  | 'ml'
  | 'mobile'
  | 'testing'
  | 'tool'
  | 'concept'
  | 'soft';

export type SkillDef = {
  id: string;
  name: string;
  category: SkillCategory;
  aliases: string[];
  caseSensitiveAliases?: string[];
  notFollowedBy?: string[];
  notPrecededBy?: string[];
  /** Extra guards applied only to the case-sensitive (ambiguous) aliases. */
  ambiguousNotFollowedBy?: string[];
  implies?: string[];
};

const s = (
  id: string,
  name: string,
  category: SkillCategory,
  aliases: string[],
  extra: Partial<Omit<SkillDef, 'id' | 'name' | 'category' | 'aliases'>> = {},
): SkillDef => ({ id, name, category, aliases: [name, ...aliases], ...extra });

export const SKILLS: SkillDef[] = [
  // Languages
  s('javascript', 'JavaScript', 'language', ['JS', 'ES6', 'ECMAScript', 'Java Script', 'Vanilla JS']),
  s('typescript', 'TypeScript', 'language', [], { caseSensitiveAliases: ['TS'], implies: ['javascript'] }),
  s('python', 'Python', 'language', ['Python3', 'Python 3']),
  s('java', 'Java', 'language', ['Core Java', 'Java 8', 'Java 11', 'Java 17'], { notFollowedBy: ['Script', ' Script'] }),
  s('cpp', 'C++', 'language', ['CPP', 'C plus plus']),
  s('csharp', 'C#', 'language', ['C Sharp', 'CSharp']),
  s('c', 'C', 'language', [], { caseSensitiveAliases: ['C'], notFollowedBy: ['++', '#', '.N', '.n', '.V', "'", '-', '/'], notPrecededBy: ['/', '-', '.', "'", '&'] }),
  s('go', 'Go', 'language', ['Golang', 'Go lang'], {
    caseSensitiveAliases: ['Go'],
    ambiguousNotFollowedBy: [' to ', ' through', ' live', ' beyond', ' ahead', '-to', ' on ', ' for ', ' with ', ' back', ' out', '-live'],
  }),
  s('rust', 'Rust', 'language', []),
  s('kotlin', 'Kotlin', 'language', []),
  s('swift', 'Swift', 'language', [], { caseSensitiveAliases: ['Swift'] }),
  s('php', 'PHP', 'language', []),
  s('ruby', 'Ruby', 'language', [], { notFollowedBy: [' on Rails'] }),
  s('r', 'R', 'language', ['R programming', 'RStudio'], { caseSensitiveAliases: ['R'], notFollowedBy: ['&', "'", '.', '-', '/'], notPrecededBy: ['&', '-', '/', "'"] }),
  s('scala', 'Scala', 'language', []),
  s('dart', 'Dart', 'language', []),
  s('bash', 'Bash', 'language', ['Shell scripting', 'Shell script', 'Shell scripts', 'Unix shell']),
  s('sql', 'SQL', 'language', ['Structured Query Language', 'SQL queries']),

  // Frontend
  s('html', 'HTML', 'frontend', ['HTML5']),
  s('css', 'CSS', 'frontend', ['CSS3']),
  s('react', 'React', 'frontend', ['React.js', 'ReactJS', 'React JS', 'React Hooks'], { notFollowedBy: [' Native', '-Native'], implies: ['javascript'] }),
  s('nextjs', 'Next.js', 'frontend', ['NextJS', 'Next JS'], { implies: ['react', 'javascript'] }),
  s('angular', 'Angular', 'frontend', ['AngularJS', 'Angular.js'], { implies: ['typescript', 'javascript'] }),
  s('vue', 'Vue.js', 'frontend', ['Vue', 'VueJS', 'Vue 3'], { implies: ['javascript'] }),
  s('svelte', 'Svelte', 'frontend', ['SvelteKit']),
  s('redux', 'Redux', 'frontend', ['Redux Toolkit', 'RTK']),
  s('tailwind', 'Tailwind CSS', 'frontend', ['Tailwind', 'TailwindCSS'], { implies: ['css'] }),
  s('bootstrap', 'Bootstrap', 'frontend', [], { implies: ['css'] }),
  s('sass', 'Sass', 'frontend', ['SCSS'], { implies: ['css'] }),
  s('jquery', 'jQuery', 'frontend', [], { implies: ['javascript'] }),
  s('webpack', 'Webpack', 'frontend', []),
  s('vite', 'Vite', 'frontend', []),
  s('responsive-design', 'Responsive Design', 'concept', ['responsive web design', 'responsive UI', 'responsive layouts', 'mobile-first design']),
  s('accessibility', 'Accessibility', 'concept', ['a11y', 'WCAG']),

  // Backend
  s('nodejs', 'Node.js', 'backend', ['NodeJS', 'Node JS'], { caseSensitiveAliases: ['Node'], implies: ['javascript'] }),
  s('express', 'Express.js', 'backend', ['Express', 'ExpressJS', 'Express JS'], { implies: ['nodejs', 'javascript'] }),
  s('nestjs', 'NestJS', 'backend', ['Nest.js'], { implies: ['nodejs', 'typescript'] }),
  s('django', 'Django', 'backend', ['Django REST Framework', 'DRF'], { implies: ['python'] }),
  s('flask', 'Flask', 'backend', [], { implies: ['python'] }),
  s('fastapi', 'FastAPI', 'backend', [], { implies: ['python'] }),
  s('spring-boot', 'Spring Boot', 'backend', ['SpringBoot'], { implies: ['spring', 'java'] }),
  s('spring', 'Spring', 'backend', ['Spring Framework', 'Spring MVC'], { caseSensitiveAliases: ['Spring'], notFollowedBy: [' Boot', 'Boot', ' semester', ' internship', ' 20'] }),
  s('hibernate', 'Hibernate', 'backend', ['JPA'], { implies: ['java'] }),
  s('dotnet', '.NET', 'backend', ['ASP.NET', 'ASP.NET Core', 'dotnet', '.NET Core'], { implies: ['csharp'] }),
  s('laravel', 'Laravel', 'backend', [], { implies: ['php'] }),
  s('rails', 'Ruby on Rails', 'backend', ['Rails', 'RoR'], { implies: ['ruby'] }),
  s('rest-api', 'REST API', 'concept', ['REST APIs', 'RESTful', 'RESTful APIs', 'RESTful API', 'RESTful services', 'RESTful web services', 'REST endpoints', 'REST services', 'API development', 'API integration', 'Web APIs'], { caseSensitiveAliases: ['REST'] }),
  s('graphql', 'GraphQL', 'backend', ['Apollo GraphQL', 'Apollo']),
  s('grpc', 'gRPC', 'backend', []),
  s('websockets', 'WebSockets', 'backend', ['WebSocket', 'Socket.io', 'Socket.IO', 'socket io']),
  s('jwt', 'JWT', 'backend', ['JSON Web Token', 'JSON Web Tokens']),
  s('oauth', 'OAuth', 'backend', ['OAuth2', 'OAuth 2.0']),
  s('microservices', 'Microservices', 'concept', ['microservice', 'micro-services', 'microservice architecture']),
  s('authentication', 'Authentication', 'concept', ['auth', 'authorization', 'user authentication', 'role-based access control', 'RBAC'], { caseSensitiveAliases: [] }),

  // Databases
  s('mysql', 'MySQL', 'database', []),
  s('postgresql', 'PostgreSQL', 'database', ['Postgres', 'Postgre SQL', 'PSQL', 'Postgres SQL']),
  s('mongodb', 'MongoDB', 'database', ['Mongo', 'Mongo DB', 'Mongoose', 'MongoDB Atlas']),
  s('sqlite', 'SQLite', 'database', []),
  s('oracle-db', 'Oracle Database', 'database', ['Oracle DB', 'Oracle SQL', 'PL/SQL']),
  s('sql-server', 'SQL Server', 'database', ['MSSQL', 'MS SQL', 'Microsoft SQL Server', 'T-SQL']),
  s('redis', 'Redis', 'database', []),
  s('firebase', 'Firebase', 'database', ['Firestore']),
  s('dynamodb', 'DynamoDB', 'database', ['Dynamo DB']),
  s('cassandra', 'Cassandra', 'database', []),
  s('elasticsearch', 'Elasticsearch', 'database', ['Elastic Search', 'ELK']),
  s('dbms', 'DBMS', 'concept', ['Database Management Systems', 'database design', 'relational databases', 'RDBMS', 'database management']),

  // Cloud & DevOps
  s('aws', 'AWS', 'cloud', ['Amazon Web Services', 'EC2', 'S3', 'AWS Lambda', 'Lambda functions'], { implies: ['cloud-computing'] }),
  s('azure', 'Azure', 'cloud', ['Microsoft Azure'], { implies: ['cloud-computing'] }),
  s('gcp', 'GCP', 'cloud', ['Google Cloud', 'Google Cloud Platform'], { implies: ['cloud-computing'] }),
  s('cloud-computing', 'Cloud Computing', 'concept', ['cloud platforms', 'cloud services', 'cloud infrastructure', 'cloud deployment']),
  s('docker', 'Docker', 'devops', ['Dockerfile', 'Docker Compose', 'containerized', 'containerised', 'containerization', 'containerisation']),
  s('kubernetes', 'Kubernetes', 'devops', ['K8s', 'kubectl', 'Helm', 'EKS', 'AKS', 'GKE']),
  s('cicd', 'CI/CD', 'devops', ['CI CD', 'CICD', 'continuous integration', 'continuous deployment', 'continuous delivery', 'CI pipelines', 'CI pipeline']),
  s('jenkins', 'Jenkins', 'devops', [], { implies: ['cicd'] }),
  s('github-actions', 'GitHub Actions', 'devops', [], { implies: ['cicd', 'git'] }),
  s('terraform', 'Terraform', 'devops', ['Infrastructure as Code', 'IaC']),
  s('ansible', 'Ansible', 'devops', []),
  s('nginx', 'Nginx', 'devops', []),
  s('linux', 'Linux', 'devops', ['Ubuntu', 'Unix']),
  s('monitoring', 'Monitoring', 'devops', ['Prometheus', 'Grafana', 'observability']),

  // Data
  s('pandas', 'Pandas', 'data', [], { implies: ['python'] }),
  s('numpy', 'NumPy', 'data', [], { implies: ['python'] }),
  s('matplotlib', 'Matplotlib', 'data', ['Seaborn'], { implies: ['python', 'data-visualization'] }),
  s('power-bi', 'Power BI', 'data', ['PowerBI', 'DAX'], { implies: ['data-visualization'] }),
  s('tableau', 'Tableau', 'data', [], { implies: ['data-visualization'] }),
  s('excel', 'Excel', 'data', ['MS Excel', 'Microsoft Excel', 'Advanced Excel', 'Google Sheets', 'pivot tables', 'VLOOKUP'], { caseSensitiveAliases: ['Excel'] }),
  s('data-analysis', 'Data Analysis', 'concept', ['data analytics', 'exploratory data analysis', 'EDA', 'analyzed data', 'analysed data']),
  s('data-visualization', 'Data Visualization', 'concept', ['data visualisation', 'dashboarding', 'visualizations', 'visualisations']),
  s('statistics', 'Statistics', 'concept', ['statistical analysis', 'hypothesis testing', 'A/B testing', 'probability']),
  s('etl', 'ETL', 'data', ['data pipelines', 'data pipeline', 'ELT']),
  s('spark', 'Apache Spark', 'data', ['PySpark', 'Spark SQL'], { caseSensitiveAliases: ['Spark'] }),
  s('hadoop', 'Hadoop', 'data', ['HDFS', 'MapReduce']),
  s('kafka', 'Kafka', 'data', ['Apache Kafka']),
  s('airflow', 'Airflow', 'data', ['Apache Airflow']),
  s('jupyter', 'Jupyter', 'data', ['Jupyter Notebook', 'Jupyter Notebooks', 'Google Colab', 'Colab']),

  // ML
  s('machine-learning', 'Machine Learning', 'ml', ['ML', 'ML models', 'machine-learning']),
  s('deep-learning', 'Deep Learning', 'ml', ['neural networks', 'neural network', 'CNN', 'CNNs', 'RNN', 'LSTM', 'transformers'], { implies: ['machine-learning'] }),
  s('nlp', 'NLP', 'ml', ['Natural Language Processing', 'text classification', 'sentiment analysis'], { implies: ['machine-learning'] }),
  s('computer-vision', 'Computer Vision', 'ml', ['image classification', 'object detection', 'image recognition'], { implies: ['machine-learning'] }),
  s('tensorflow', 'TensorFlow', 'ml', ['TF2', 'TensorFlow 2'], { implies: ['machine-learning', 'deep-learning', 'python'] }),
  s('pytorch', 'PyTorch', 'ml', ['Torch'], { implies: ['machine-learning', 'deep-learning', 'python'] }),
  s('keras', 'Keras', 'ml', [], { implies: ['machine-learning', 'deep-learning', 'python'] }),
  s('scikit-learn', 'scikit-learn', 'ml', ['sklearn', 'scikit learn', 'scikitlearn', 'sci-kit learn'], { implies: ['machine-learning', 'python'] }),
  s('opencv', 'OpenCV', 'ml', ['cv2'], { implies: ['computer-vision'] }),
  s('huggingface', 'Hugging Face', 'ml', ['HuggingFace', 'Hugging Face Transformers'], { implies: ['machine-learning', 'nlp'] }),
  s('llm', 'LLMs', 'ml', ['LLM', 'large language models', 'large language model', 'GPT', 'prompt engineering', 'RAG'], { implies: ['machine-learning'] }),
  s('langchain', 'LangChain', 'ml', [], { implies: ['llm'] }),
  s('mlops', 'MLOps', 'ml', ['model deployment', 'MLflow']),

  // Mobile
  s('react-native', 'React Native', 'mobile', ['ReactNative', 'Expo'], { implies: ['javascript'] }),
  s('flutter', 'Flutter', 'mobile', [], { implies: ['dart'] }),
  s('android', 'Android', 'mobile', ['Android Studio', 'Android SDK', 'Jetpack Compose']),
  s('ios', 'iOS', 'mobile', ['SwiftUI', 'UIKit', 'Xcode']),

  // Testing
  s('jest', 'Jest', 'testing', [], { implies: ['unit-testing'] }),
  s('mocha', 'Mocha', 'testing', ['Chai'], { implies: ['unit-testing'] }),
  s('vitest', 'Vitest', 'testing', [], { implies: ['unit-testing'] }),
  s('cypress', 'Cypress', 'testing', [], { implies: ['e2e-testing'] }),
  s('playwright', 'Playwright', 'testing', [], { implies: ['e2e-testing'] }),
  s('selenium', 'Selenium', 'testing', ['Selenium WebDriver'], { implies: ['e2e-testing'] }),
  s('junit', 'JUnit', 'testing', ['Mockito'], { implies: ['unit-testing', 'java'] }),
  s('pytest', 'PyTest', 'testing', [], { implies: ['unit-testing', 'python'] }),
  s('unit-testing', 'Unit Testing', 'testing', ['unit tests', 'unit test', 'test cases', 'TDD', 'test-driven development', 'automated tests', 'automated testing', 'integration tests']),
  s('e2e-testing', 'End-to-End Testing', 'testing', ['E2E testing', 'end to end testing', 'E2E tests']),

  // Tools & process
  s('git', 'Git', 'tool', ['version control', 'Git version control'], { notFollowedBy: ['Hub', 'Lab', 'hub', 'lab'] }),
  s('github', 'GitHub', 'tool', [], { implies: ['git'] }),
  s('gitlab', 'GitLab', 'tool', ['GitLab CI'], { implies: ['git'] }),
  s('jira', 'Jira', 'tool', []),
  s('postman', 'Postman', 'tool', []),
  s('figma', 'Figma', 'tool', []),
  s('agile', 'Agile', 'concept', ['Scrum', 'Kanban', 'sprint planning', 'sprints']),

  // CS fundamentals
  s('dsa', 'Data Structures and Algorithms', 'concept', ['DSA', 'data structures', 'algorithms', 'competitive programming', 'LeetCode', 'Codeforces', 'CodeChef']),
  s('oop', 'Object-Oriented Programming', 'concept', ['OOP', 'OOPs', 'object oriented programming', 'object-oriented design', 'OOAD']),
  s('operating-systems', 'Operating Systems', 'concept', ['OS concepts', 'operating system']),
  s('computer-networks', 'Computer Networks', 'concept', ['networking', 'TCP/IP', 'computer networking']),
  s('system-design', 'System Design', 'concept', ['high-level design', 'low-level design', 'HLD', 'LLD', 'scalable architecture', 'distributed systems']),
  s('caching', 'Caching', 'concept', ['cache', 'caching layer', 'CDN']),
  s('performance-optimization', 'Performance Optimization', 'concept', ['performance tuning', 'web performance', 'query optimization', 'optimized performance', 'Lighthouse']),

  // Soft skills
  s('communication', 'Communication', 'soft', ['communication skills', 'verbal communication', 'written communication', 'presented', 'presentation skills']),
  s('teamwork', 'Teamwork', 'soft', ['collaboration', 'collaborated', 'team player', 'cross-functional', 'collaborative', 'worked in a team', 'team of']),
  s('problem-solving', 'Problem Solving', 'soft', ['problem-solving', 'analytical skills', 'analytical thinking', 'debugging']),
  s('leadership', 'Leadership', 'soft', ['led a team', 'team lead', 'mentored', 'led', 'coordinator', 'captain', 'president']),
  s('ownership', 'Ownership', 'soft', ['self-starter', 'self-motivated', 'take ownership', 'end-to-end ownership', 'independently']),
];

/** Transferable-skill groups. Similarity is the maximum PARTIAL credit fraction (0..1). */
export const RELATED_GROUPS: Array<{ skills: string[]; similarity: number; label: string }> = [
  { skills: ['mysql', 'postgresql', 'sqlite', 'sql-server', 'oracle-db'], similarity: 0.6, label: 'relational databases' },
  { skills: ['mongodb', 'dynamodb', 'cassandra', 'firebase'], similarity: 0.5, label: 'NoSQL databases' },
  { skills: ['react', 'angular', 'vue', 'svelte', 'nextjs'], similarity: 0.5, label: 'component-based frontend frameworks' },
  { skills: ['express', 'nestjs'], similarity: 0.6, label: 'Node.js web frameworks' },
  { skills: ['django', 'flask', 'fastapi'], similarity: 0.6, label: 'Python web frameworks' },
  { skills: ['express', 'django', 'flask', 'fastapi', 'spring-boot', 'dotnet', 'laravel', 'rails', 'nestjs'], similarity: 0.35, label: 'backend web frameworks' },
  { skills: ['aws', 'azure', 'gcp'], similarity: 0.6, label: 'public cloud platforms' },
  { skills: ['jenkins', 'github-actions', 'gitlab', 'cicd'], similarity: 0.6, label: 'CI/CD tooling' },
  { skills: ['docker', 'kubernetes'], similarity: 0.4, label: 'container tooling' },
  { skills: ['tensorflow', 'pytorch', 'keras'], similarity: 0.6, label: 'deep learning frameworks' },
  { skills: ['scikit-learn', 'tensorflow', 'pytorch'], similarity: 0.4, label: 'ML libraries' },
  { skills: ['power-bi', 'tableau'], similarity: 0.6, label: 'BI tools' },
  { skills: ['jest', 'mocha', 'vitest', 'pytest', 'junit'], similarity: 0.5, label: 'unit testing frameworks' },
  { skills: ['cypress', 'playwright', 'selenium'], similarity: 0.6, label: 'browser automation' },
  { skills: ['java', 'kotlin', 'scala'], similarity: 0.5, label: 'JVM languages' },
  { skills: ['c', 'cpp'], similarity: 0.5, label: 'C-family systems languages' },
  { skills: ['java', 'csharp'], similarity: 0.35, label: 'statically typed OOP languages' },
  { skills: ['react-native', 'flutter', 'android', 'ios'], similarity: 0.45, label: 'mobile development' },
  { skills: ['spark', 'hadoop'], similarity: 0.5, label: 'big data processing' },
  { skills: ['tailwind', 'bootstrap', 'sass'], similarity: 0.6, label: 'CSS tooling' },
  { skills: ['rest-api', 'graphql', 'grpc'], similarity: 0.45, label: 'API styles' },
  { skills: ['pandas', 'excel', 'sql'], similarity: 0.3, label: 'data wrangling' },
];

export const DOMAIN_KEYWORDS = [
  'fintech', 'e-commerce', 'ecommerce', 'healthcare', 'healthtech', 'edtech', 'saas', 'banking', 'payments', 'insurance',
  'logistics', 'supply chain', 'cybersecurity', 'security', 'gaming', 'real-time', 'b2b', 'b2c', 'marketplace', 'retail',
  'telecom', 'media', 'adtech', 'crm', 'erp', 'iot', 'automotive', 'travel', 'hospitality', 'social media', 'analytics',
  'web applications', 'mobile applications', 'consumer', 'enterprise', 'startup', 'open source',
];

const SKILL_INDEX = new Map(SKILLS.map((skill) => [skill.id, skill]));

export const getSkill = (id: string): SkillDef | undefined => SKILL_INDEX.get(id);

export const skillName = (id: string): string => SKILL_INDEX.get(id)?.name ?? id;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type CompiledAlias = { skillId: string; alias: string; regex: RegExp; caseSensitive: boolean; length: number };

const buildRegex = (alias: string, caseSensitive: boolean, def: SkillDef) => {
  const notFollowed = [...(def.notFollowedBy ?? []), ...(caseSensitive ? def.ambiguousNotFollowedBy ?? [] : [])].map((value) => `(?!${escapeRegex(value)})`).join('');
  const notPreceded = (def.notPrecededBy ?? []).map((value) => `(?<!${escapeRegex(value)})`).join('');
  // Technology-aware boundaries: treat + # and letters/digits as word characters, allow trailing punctuation.
  const pattern = `(?<![A-Za-z0-9+#_])${notPreceded}${escapeRegex(alias).replace(/ /g, '[\\s-]+')}(?![A-Za-z0-9+#_])${notFollowed}`;
  return new RegExp(pattern, caseSensitive ? 'g' : 'gi');
};

const COMPILED: CompiledAlias[] = SKILLS.flatMap((def) => {
  const caseSensitive = new Set(def.caseSensitiveAliases ?? []);
  const insensitive = def.aliases.filter((alias) => !caseSensitive.has(alias));
  return [
    ...insensitive.map((alias) => ({ skillId: def.id, alias, regex: buildRegex(alias, false, def), caseSensitive: false, length: alias.length })),
    ...[...caseSensitive].map((alias) => ({ skillId: def.id, alias, regex: buildRegex(alias, true, def), caseSensitive: true, length: alias.length })),
  ];
}).sort((a, b) => b.length - a.length);

export type SkillMention = { skillId: string; alias: string; matchedText: string; index: number; end: number };

/**
 * Finds every canonical skill mentioned in `text`. Longer aliases win when spans overlap
 * ("React Native" beats "React", "Spring Boot" beats "Spring").
 */
export const findSkillMentions = (text: string): SkillMention[] => {
  const taken: Array<[number, number]> = [];
  const mentions: SkillMention[] = [];

  for (const compiled of COMPILED) {
    compiled.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = compiled.regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (match[0].length === 0) {
        compiled.regex.lastIndex += 1;
        continue;
      }
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      mentions.push({ skillId: compiled.skillId, alias: compiled.alias, matchedText: match[0], index: start, end });
    }
  }

  return mentions.sort((a, b) => a.index - b.index);
};

export const findSkillIds = (text: string): string[] => [...new Set(findSkillMentions(text).map((mention) => mention.skillId))];

/** Resolve a free-text phrase ("Postgres", "RESTful APIs", "GoLang") to a canonical skill id. */
export const canonicalizeSkill = (phrase: string): string | undefined => {
  const mentions = findSkillMentions(phrase);
  if (mentions.length === 0) {
    // Short ambiguous tokens are case-sensitive in prose but a user typing "go" or "golang" means the skill.
    const lowered = phrase.trim().toLowerCase();
    return SKILLS.find((def) => def.aliases.some((alias) => alias.toLowerCase() === lowered) || (def.caseSensitiveAliases ?? []).some((alias) => alias.toLowerCase() === lowered))?.id;
  }
  return mentions.sort((a, b) => b.matchedText.length - a.matchedText.length)[0].skillId;
};

/** Transitive closure of `implies`. */
export const expandImplied = (skillIds: Iterable<string>): Map<string, string> => {
  const result = new Map<string, string>();
  const queue = [...skillIds].map((id) => ({ id, via: id }));
  while (queue.length > 0) {
    const { id, via } = queue.shift()!;
    for (const implied of SKILL_INDEX.get(id)?.implies ?? []) {
      if (!result.has(implied)) {
        result.set(implied, via);
        queue.push({ id: implied, via });
      }
    }
  }
  return result;
};

export const relatedSkills = (skillId: string): Array<{ skillId: string; similarity: number; label: string }> => {
  const best = new Map<string, { similarity: number; label: string }>();
  for (const group of RELATED_GROUPS) {
    if (!group.skills.includes(skillId)) continue;
    for (const other of group.skills) {
      if (other === skillId) continue;
      const current = best.get(other);
      if (!current || current.similarity < group.similarity) best.set(other, { similarity: group.similarity, label: group.label });
    }
  }
  return [...best.entries()].map(([id, value]) => ({ skillId: id, ...value }));
};

export const isTechnicalCategory = (category: SkillCategory) => category !== 'soft';

/** Specific technologies (as opposed to broad concepts) must never be "assumed" from related tech. */
export const isSpecificTechnology = (skillId: string) => {
  const category = SKILL_INDEX.get(skillId)?.category;
  return category !== undefined && category !== 'concept' && category !== 'soft';
};

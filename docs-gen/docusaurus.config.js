// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github')
const darkCodeTheme = require('prism-react-renderer/themes/dracula')

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Obsidian Jira Issue',
  tagline: 'Track the progress of Atlassian Jira issues from your Obsidian notes',
  url: 'https://GoWebProd.github.io',
  trailingSlash: false,
  baseUrl: '/obsidian-jira-master/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  // favicon: 'img/favicon.ico',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'GoWebProd', // Usually your GitHub org/user name.
  projectName: 'obsidian-jira-master', // Usually your repo name.

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Obsidian Jira Issue',
        // logo: {
        //   alt: 'obsidian-jira-master',
        //   src: 'img/logo.svg',
        // },
        items: [
          {
            type: 'doc',
            docId: 'get-started/introduction',
            position: 'left',
            label: 'Get Started',
          },
          {
            type: 'doc',
            docId: '/category/configuration',
            position: 'left',
            label: 'Configuration',
          },
          {
            type: 'doc',
            docId: '/category/components',
            position: 'left',
            label: 'Components',
          },
          {
            type: 'doc',
            docId: '/category/api',
            position: 'left',
            label: 'API',
          },
          {
            href: 'https://github.com/GoWebProd/obsidian-jira-master',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        // links: [
        //   {
        //     title: 'Docs',
        //     items: [
        //       {
        //         label: 'Get Started',
        //         to: '/docs/get-started/introduction',
        //       },
        //       {
        //         label: 'Components',
        //         to: '/docs/category/components',
        //       },
        //     ],
        //   },
        //   {
        //     title: 'Community',
        //     items: [
        //       {
        //         label: 'GitHub',
        //         href: 'https://github.com/marc0l92',
        //       },
        //     ],
        //   },
        // ],
        copyright: `Copyright © ${new Date().getFullYear()} obsidian-jira-master. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
    plugins: [],
    themes: [
      // Temporarily disabled due to Node.js v24 compatibility issues
      // [
      //   require.resolve("@easyops-cn/docusaurus-search-local"),
      //   {
      //     hashed: true,
      //   },
      // ],
    ],
}

module.exports = config

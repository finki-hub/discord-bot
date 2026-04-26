/* eslint-disable @typescript-eslint/restrict-template-expressions -- unknown errors are interpolated into user-facing debug strings */

export const apiErrorFunctions = {
  getLinkError: (error: unknown) => `Failed getting link\n${error}`,

  getLinkNamesError: (error: unknown) => `Failed getting link names\n${error}`,

  getLinksError: (error: unknown) => `Failed getting links\n${error}`,

  getNthLinkError: (error: unknown) => `Failed getting nth link\n${error}`,

  getNthQuestionError: (error: unknown) =>
    `Failed getting nth question\n${error}`,

  getQuestionError: (error: unknown) => `Failed getting question\n${error}`,

  getQuestionNamesError: (error: unknown) =>
    `Failed getting question names\n${error}`,

  getQuestionsError: (error: unknown) => `Failed getting questions\n${error}`,
};

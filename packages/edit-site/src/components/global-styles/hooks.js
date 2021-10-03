/**
 * External dependencies
 */
import { get, cloneDeep, set, isEqual, has, mergeWith } from 'lodash';

/**
 * WordPress dependencies
 */
import { useMemo, useCallback } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { useEntityProp } from '@wordpress/core-data';
import {
	getBlockType,
	__EXPERIMENTAL_PATHS_WITH_MERGE as PATHS_WITH_MERGE,
	__EXPERIMENTAL_STYLE_PROPERTY as STYLE_PROPERTY,
} from '@wordpress/blocks';

/**
 * Internal dependencies
 */
import { store as editSiteStore } from '../../store';
import {
	PRESET_METADATA,
	getValueFromVariable,
	getPresetVariableFromValue,
} from '../editor/utils';

const EMPTY_CONFIG = { isGlobalStylesUserThemeJSON: true, version: 1 };

function mergeTreesCustomizer( objValue, srcValue ) {
	// We only pass as arrays the presets,
	// in which case we want the new array of values
	// to override the old array (no merging).
	if ( Array.isArray( srcValue ) ) {
		return srcValue;
	}
}

function mergeBaseAndUserConfigs( base, user ) {
	return mergeWith( {}, base, user, mergeTreesCustomizer );
}

function addUserOriginToSettings( settingsToAdd ) {
	PRESET_METADATA.forEach( ( { path } ) => {
		const presetData = get( settingsToAdd, path );
		if ( presetData ) {
			set( settingsToAdd, path, {
				user: presetData,
			} );
		}
	} );
	return settingsToAdd;
}

function removeUserOriginFromSettings( settingsToRemove ) {
	PRESET_METADATA.forEach( ( { path } ) => {
		const presetData = get( settingsToRemove, path );
		if ( presetData ) {
			set( settingsToRemove, path, ( presetData ?? {} ).user );
		}
	} );
	return settingsToRemove;
}

function useGlobalStylesUserConfig() {
	const globalStylesId = useSelect( ( select ) => {
		return select( editSiteStore ).getSettings()
			.__experimentalGlobalStylesUserEntityId;
	}, [] );

	const [ content, setContent ] = useEntityProp(
		'postType',
		'wp_global_styles',
		'content',
		globalStylesId
	);

	const config = useMemo( () => {
		let parsedConfig;
		try {
			parsedConfig = content ? JSON.parse( content ) : {};
			// It is very important to verify if the flag isGlobalStylesUserThemeJSON is true.
			// If it is not true the content was not escaped and is not safe.
			if ( ! parsedConfig.isGlobalStylesUserThemeJSON ) {
				parsedConfig = {};
			} else {
				parsedConfig = {
					...parsedConfig,
					settings: addUserOriginToSettings( parsedConfig.settings ),
				};
			}
		} catch ( e ) {
			/* eslint-disable no-console */
			console.error( 'Global Styles User data is not valid' );
			console.error( e );
			/* eslint-enable no-console */
			parsedConfig = {};
		}

		return parsedConfig;
	}, [ content ] );

	const setConfig = useCallback(
		( newConfig ) =>
			setContent(
				JSON.stringify( {
					...newConfig,
					settings: removeUserOriginFromSettings(
						newConfig.settings
					),
				} )
			),
		[ setContent ]
	);

	return [ config, setConfig ];
}

function useGlobalStylesBaseConfig() {
	const baseConfig = useSelect( ( select ) => {
		return select( editSiteStore ).getSettings()
			.__experimentalGlobalStylesBaseStyles;
	}, [] );

	return baseConfig;
}

function useGlobalStylesConfig() {
	const [ userConfig, setUserConfig ] = useGlobalStylesUserConfig();
	const baseConfig = useGlobalStylesBaseConfig();

	return [ baseConfig, userConfig, setUserConfig ];
}

export const useGlobalStylesReset = () => {
	const [ config, setConfig ] = useGlobalStylesUserConfig();
	const canReset = !! config && ! isEqual( config, EMPTY_CONFIG );
	return [
		canReset,
		useCallback( () => setConfig( EMPTY_CONFIG ), [ setConfig ] ),
	];
};

export function useSetting( path, blockName, source = 'all' ) {
	const [ baseConfig, userConfig, setUserConfig ] = useGlobalStylesConfig();
	const finalPath = ! blockName
		? `settings.${ path }`
		: `settings.blocks.${ blockName }.${ path }`;

	const getBaseSetting = () => {
		const result = get( baseConfig, finalPath );
		if ( PATHS_WITH_MERGE[ path ] ) {
			return result.theme ?? result.core;
		}
	};

	const setSetting = ( newValue ) => {
		const newUserConfig = cloneDeep( userConfig );
		set( newUserConfig, finalPath, newValue );
		setUserConfig( newUserConfig );
	};

	let result;
	switch ( source ) {
		case 'all':
			result = get( userConfig, finalPath, {} ).user ?? getBaseSetting();
			break;
		case 'user':
			result = get( userConfig, finalPath, {} ).user;
			break;
		case 'base':
			result = getBaseSetting();
			break;
		default:
			throw 'Unsupported source';
	}

	return [ result, setSetting ];
}

export function useStyle( path, blockName, source = 'all' ) {
	const [ baseConfig, userConfig, setUserConfig ] = useGlobalStylesConfig();
	const mergedConfig = mergeBaseAndUserConfigs( baseConfig, userConfig );
	const finalPath = ! blockName
		? `styles.${ path }`
		: `styles.blocks.${ blockName }.${ path }`;

	const setStyle = ( newValue ) => {
		const newUserConfig = cloneDeep( userConfig );
		set(
			newUserConfig,
			finalPath,
			getPresetVariableFromValue(
				mergedConfig.settings,
				blockName,
				path,
				newValue
			)
		);
		setUserConfig( newUserConfig );
	};

	let result;
	switch ( source ) {
		case 'all':
			result = getValueFromVariable(
				mergedConfig.settings,
				blockName,
				get( userConfig, finalPath ) ?? get( baseConfig, finalPath )
			);
			break;
		case 'user':
			result = getValueFromVariable(
				mergedConfig.settings,
				blockName,
				get( userConfig, finalPath )
			);
			break;
		case 'base':
			result = getValueFromVariable(
				baseConfig.settings,
				blockName,
				get( baseConfig, finalPath )
			);
			break;
		default:
			throw 'Unsupported source';
	}

	return [ result, setStyle ];
}

const ROOT_BLOCK_SUPPORTS = [
	'background',
	'backgroundColor',
	'color',
	'linkColor',
	'fontFamily',
	'fontSize',
	'fontStyle',
	'fontWeight',
	'lineHeight',
	'textDecoration',
	'textTransform',
	'padding',
];

export function getSupportedGlobalStylesPanels( name ) {
	if ( ! name ) {
		return ROOT_BLOCK_SUPPORTS;
	}

	const blockType = getBlockType( name );

	if ( ! blockType ) {
		return [];
	}

	const supportKeys = [];
	Object.keys( STYLE_PROPERTY ).forEach( ( styleName ) => {
		if ( ! STYLE_PROPERTY[ styleName ].support ) {
			return;
		}

		// Opting out means that, for certain support keys like background color,
		// blocks have to explicitly set the support value false. If the key is
		// unset, we still enable it.
		if ( STYLE_PROPERTY[ name ].requiresOptOut ) {
			if (
				has(
					blockType.supports,
					STYLE_PROPERTY[ name ].support[ 0 ]
				) &&
				get( blockType.supports, STYLE_PROPERTY[ name ].support ) !==
					false
			) {
				return supportKeys.push( name );
			}
		}

		if (
			get( blockType.supports, STYLE_PROPERTY[ name ].support, false )
		) {
			return supportKeys.push( name );
		}
	} );

	return supportKeys;
}
